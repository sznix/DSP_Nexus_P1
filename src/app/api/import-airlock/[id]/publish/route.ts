/**
 * POST /api/import-airlock/:id/publish
 *
 * Publish the staged data to daily_assignments.
 * - Creates new assignments for "add" rows
 * - Updates existing assignments for "update" rows
 * - Clears identity fields for "remove" rows (no hard deletes)
 * - Logs all changes to assignment_event_log
 * - Updates work_days snapshot_version and status
 *
 * Requires admin or manager role.
 */

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type {
  StagedRow,
  DiffRow,
  DiffSummary,
  PublishRequest,
} from "@/lib/import-airlock";
import { normalizeName } from "@/lib/import-airlock";
import crypto from "crypto";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(["admin", "manager"]);
    const { id: batchId } = await params;

    if (!batchId) {
      return NextResponse.json(
        { ok: false, error: "Missing batch id" },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { skipUnresolved = false } = body as PublishRequest;

    const supabase = await createClient();

    // Fetch the batch
    const { data: batch, error: fetchError } = await supabase
      .from("import_batches")
      .select("*")
      .eq("id", batchId)
      .eq("tenant_id", user.tenantId)
      .single();

    if (fetchError || !batch) {
      return NextResponse.json(
        { ok: false, error: "Import batch not found" },
        { status: 404 }
      );
    }

    // Check status
    if (batch.status !== "diffed") {
      return NextResponse.json(
        {
          ok: false,
          error: `Cannot publish batch with status '${batch.status}'. Expected 'diffed'.`,
        },
        { status: 400 }
      );
    }

    const stagedData = batch.staged_data as StagedRow[];
    const diffRows = batch.diff_rows as DiffRow[];
    const diffSummary = batch.diff_summary as DiffSummary;

    if (!stagedData || !diffRows) {
      return NextResponse.json(
        { ok: false, error: "Missing staged data or diff" },
        { status: 400 }
      );
    }

    // Check for unresolved drivers
    const unresolvedRows = stagedData.filter(
      (r) =>
        r.errors.length > 0 || (r.driver_name && !r.driver_resolved && !r.driver_id)
    );

    if (unresolvedRows.length > 0 && !skipUnresolved) {
      return NextResponse.json(
        {
          ok: false,
          error: `${unresolvedRows.length} rows have unresolved drivers. Set skipUnresolved=true to skip them.`,
          unresolvedCount: unresolvedRows.length,
        },
        { status: 400 }
      );
    }

    // Build staged data lookup
    const stagedByIndex = new Map<number, StagedRow>();
    for (const staged of stagedData) {
      stagedByIndex.set(staged.rowIndex, staged);
    }

    // Track results
    const results = {
      created: 0,
      updated: 0,
      cleared: 0,
      skipped: 0,
      driversCreated: 0,
      aliasesCreated: 0,
      errors: [] as string[],
    };

    const eventLogs: Array<{
      tenant_id: string;
      assignment_id: string;
      event_type: string;
      event_data: Record<string, unknown>;
      user_id: string;
    }> = [];

    // Create new drivers for unresolved names
    const driversToCreate = stagedData.filter(
      (r) =>
        r.driver_name &&
        !r.driver_resolved &&
        !r.driver_id &&
        r.errors.length === 0
    );

    const createdDriverIds = new Map<string, string>();

    for (const staged of driversToCreate) {
      if (!staged.driver_name) continue;

      const normalized = normalizeName(staged.driver_name);

      // Check if we already created this driver in this batch
      if (createdDriverIds.has(normalized)) {
        staged.driver_id = createdDriverIds.get(normalized)!;
        staged.driver_resolved = true;
        staged.driver_match_type = "new";
        continue;
      }

      // Parse name into first/last
      const nameParts = staged.driver_name.trim().split(/\s+/);
      const firstName = nameParts[0] ?? staged.driver_name;
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : null;

      // Create the driver
      const { data: newDriver, error: driverError } = await supabase
        .from("drivers")
        .insert({
          tenant_id: user.tenantId,
          display_name: staged.driver_name.trim(),
          first_name: firstName,
          last_name: lastName,
          active: true,
        })
        .select("id")
        .single();

      if (driverError) {
        console.error("[import-airlock/publish] Failed to create driver", driverError);
        results.errors.push(`Failed to create driver "${staged.driver_name}"`);
        continue;
      }

      results.driversCreated++;
      createdDriverIds.set(normalized, newDriver.id);

      // Create alias for this name
      const { error: aliasError } = await supabase.from("driver_aliases").insert({
        tenant_id: user.tenantId,
        driver_id: newDriver.id,
        alias: staged.driver_name.trim(),
        normalized_alias: normalized,
      });

      if (!aliasError) {
        results.aliasesCreated++;
      }

      // Update the staged row
      staged.driver_id = newDriver.id;
      staged.driver_resolved = true;
      staged.driver_match_type = "new";
    }

    // Process diff rows
    for (const diff of diffRows) {
      try {
        if (diff.action === "add") {
          // Get staged row
          if (diff.stagedRowIndex === null) continue;
          const staged = stagedByIndex.get(diff.stagedRowIndex);
          if (!staged) continue;

          // Skip rows with errors
          if (staged.errors.length > 0) {
            results.skipped++;
            continue;
          }

          // Skip if driver still unresolved
          if (staged.driver_name && !staged.driver_id) {
            results.skipped++;
            continue;
          }

          // Create new assignment
          const { data: newAssignment, error: insertError } = await supabase
            .from("daily_assignments")
            .insert({
              tenant_id: user.tenantId,
              day_date: batch.work_date,
              driver_id: staged.driver_id,
              van_id: staged.van_id,
              route_code: staged.route_code,
              pad_id: staged.pad_id,
              dispatch_time: staged.dispatch_time,
              cart_location: staged.cart_location,
              lot_spot_id: staged.lot_spot_id,
              // Default statuses
              card_status: "UNKNOWN",
              key_status: "UNKNOWN",
              verification_status: "pending",
              rollout_status: "pending",
            })
            .select("id")
            .single();

          if (insertError) {
            console.error("[import-airlock/publish] Insert failed", insertError);
            results.errors.push(
              `Failed to create assignment for row ${diff.stagedRowIndex}`
            );
            continue;
          }

          results.created++;

          // Log event
          eventLogs.push({
            tenant_id: user.tenantId,
            assignment_id: newAssignment.id,
            event_type: "created",
            event_data: {
              import_batch_id: batchId,
              staged_row_index: diff.stagedRowIndex,
              driver_id: staged.driver_id,
              van_id: staged.van_id,
              route_code: staged.route_code,
            },
            user_id: user.userId,
          });
        } else if (diff.action === "update") {
          // Get staged row
          if (diff.stagedRowIndex === null || !diff.existingAssignmentId) continue;
          const staged = stagedByIndex.get(diff.stagedRowIndex);
          if (!staged) continue;

          // Skip rows with errors
          if (staged.errors.length > 0) {
            results.skipped++;
            continue;
          }

          // Build update payload with only changed fields
          const updatePayload: Record<string, unknown> = {};

          if (diff.changedFields.includes("driver")) {
            updatePayload.driver_id = staged.driver_id;
          }
          if (diff.changedFields.includes("van")) {
            updatePayload.van_id = staged.van_id;
          }
          if (diff.changedFields.includes("route_code")) {
            updatePayload.route_code = staged.route_code;
          }
          if (diff.changedFields.includes("pad")) {
            updatePayload.pad_id = staged.pad_id;
          }
          if (diff.changedFields.includes("dispatch_time")) {
            updatePayload.dispatch_time = staged.dispatch_time;
          }
          if (diff.changedFields.includes("cart_location")) {
            updatePayload.cart_location = staged.cart_location;
          }
          if (diff.changedFields.includes("lot_spot")) {
            updatePayload.lot_spot_id = staged.lot_spot_id;
          }

          if (Object.keys(updatePayload).length === 0) {
            continue;
          }

          const { error: updateError } = await supabase
            .from("daily_assignments")
            .update(updatePayload)
            .eq("id", diff.existingAssignmentId);

          if (updateError) {
            console.error("[import-airlock/publish] Update failed", updateError);
            results.errors.push(
              `Failed to update assignment ${diff.existingAssignmentId}`
            );
            continue;
          }

          results.updated++;

          // Log event
          eventLogs.push({
            tenant_id: user.tenantId,
            assignment_id: diff.existingAssignmentId,
            event_type: "modified",
            event_data: {
              import_batch_id: batchId,
              changed_fields: diff.changedFields,
              before: diff.before,
              after: diff.after,
            },
            user_id: user.userId,
          });
        } else if (diff.action === "remove") {
          // Clear identity fields instead of deleting
          if (!diff.existingAssignmentId) continue;

          const { error: clearError } = await supabase
            .from("daily_assignments")
            .update({
              driver_id: null,
              van_id: null,
              route_code: null,
              pad_id: null,
              dispatch_time: null,
              cart_location: null,
              lot_spot_id: null,
              // Safe default statuses
              card_status: "UNKNOWN",
              key_status: "UNKNOWN",
              verification_status: "pending",
              rollout_status: "pending",
            })
            .eq("id", diff.existingAssignmentId);

          if (clearError) {
            console.error("[import-airlock/publish] Clear failed", clearError);
            results.errors.push(
              `Failed to clear assignment ${diff.existingAssignmentId}`
            );
            continue;
          }

          results.cleared++;

          // Log event
          eventLogs.push({
            tenant_id: user.tenantId,
            assignment_id: diff.existingAssignmentId,
            event_type: "cleared",
            event_data: {
              import_batch_id: batchId,
              before: diff.before,
            },
            user_id: user.userId,
          });
        }
      } catch (err) {
        console.error("[import-airlock/publish] Row processing error", err);
        results.errors.push(
          `Error processing diff row: ${err instanceof Error ? err.message : "Unknown"}`
        );
      }
    }

    // Insert event logs in batches
    if (eventLogs.length > 0) {
      const { error: logError } = await supabase
        .from("assignment_event_log")
        .insert(eventLogs);

      if (logError) {
        console.error("[import-airlock/publish] Event log insert failed", logError);
        // Non-fatal, continue
      }
    }

    // Update or create work_day record
    const { data: existingWorkDay } = await supabase
      .from("work_days")
      .select("id, snapshot_version")
      .eq("tenant_id", user.tenantId)
      .eq("day_date", batch.work_date)
      .single();

    // Compute content hash from final assignments
    const { data: finalAssignments } = await supabase
      .from("daily_assignments")
      .select("id, driver_id, van_id, route_code, pad_id, dispatch_time, lot_spot_id")
      .eq("tenant_id", user.tenantId)
      .eq("day_date", batch.work_date)
      .order("route_code");

    const contentHash = crypto
      .createHash("sha256")
      .update(JSON.stringify(finalAssignments ?? []))
      .digest("hex")
      .substring(0, 16);

    if (existingWorkDay) {
      // Bump version
      const { error: workDayError } = await supabase
        .from("work_days")
        .update({
          snapshot_version: (existingWorkDay.snapshot_version ?? 0) + 1,
          content_hash: contentHash,
          status: "published",
          published_at: new Date().toISOString(),
          published_by: user.userId,
        })
        .eq("id", existingWorkDay.id);

      if (workDayError) {
        console.error("[import-airlock/publish] Work day update failed", workDayError);
      }
    } else {
      // Create new work_day
      const { error: workDayError } = await supabase.from("work_days").insert({
        tenant_id: user.tenantId,
        day_date: batch.work_date,
        snapshot_version: 1,
        content_hash: contentHash,
        status: "published",
        published_at: new Date().toISOString(),
        published_by: user.userId,
      });

      if (workDayError) {
        console.error("[import-airlock/publish] Work day insert failed", workDayError);
      }
    }

    // Update import batch status
    const { error: batchUpdateError } = await supabase
      .from("import_batches")
      .update({
        status: "published",
        approved_by: user.userId,
        approved_at: new Date().toISOString(),
      })
      .eq("id", batchId);

    if (batchUpdateError) {
      console.error("[import-airlock/publish] Batch update failed", batchUpdateError);
    }

    return NextResponse.json({
      ok: true,
      data: {
        batchId,
        status: "published",
        results,
        summary: {
          ...diffSummary,
          created: results.created,
          updated: results.updated,
          cleared: results.cleared,
          skipped: results.skipped,
          driversCreated: results.driversCreated,
          aliasesCreated: results.aliasesCreated,
          errors: results.errors.length,
        },
      },
    });
  } catch (err) {
    if (err instanceof Response) return err;

    console.error("[import-airlock/publish] Unhandled error", err);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
