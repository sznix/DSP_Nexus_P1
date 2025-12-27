/**
 * POST /api/import-airlock/:id/diff
 *
 * Compute diff between staged data and existing daily_assignments.
 * Requires admin or manager role.
 */

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type {
  StagedRow,
  DiffRow,
  DiffSummary,
  DiffAction,
} from "@/lib/import-airlock";

type ExistingAssignment = {
  id: string;
  driver_id: string | null;
  van_id: string | null;
  route_code: string | null;
  pad_id: string | null;
  dispatch_time: string | null;
  cart_location: string | null;
  lot_spot_id: string | null;
  driver?: { display_name: string } | null;
  van?: { label: string } | null;
  pad?: { name: string } | null;
  lot_spot?: { label: string } | null;
};

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
    if (batch.status !== "mapped" && batch.status !== "diffed") {
      return NextResponse.json(
        {
          ok: false,
          error: `Cannot diff batch with status '${batch.status}'. Expected 'mapped'.`,
        },
        { status: 400 }
      );
    }

    const stagedData = batch.staged_data as StagedRow[];
    if (!stagedData || stagedData.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No staged data to diff" },
        { status: 400 }
      );
    }

    // Fetch existing assignments for the work date
    const { data: existingAssignments, error: assignmentsError } = await supabase
      .from("daily_assignments")
      .select(`
        id,
        driver_id,
        van_id,
        route_code,
        pad_id,
        dispatch_time,
        cart_location,
        lot_spot_id,
        driver:drivers(display_name),
        van:vans(label),
        pad:pads(name),
        lot_spot:lot_spots(label)
      `)
      .eq("tenant_id", user.tenantId)
      .eq("day_date", batch.work_date);

    if (assignmentsError) {
      console.error("[import-airlock/diff] Fetch assignments failed", assignmentsError);
      return NextResponse.json(
        { ok: false, error: "Failed to fetch existing assignments" },
        { status: 500 }
      );
    }

    const existing: ExistingAssignment[] = (existingAssignments ?? []).map(
      (a) => ({
        ...a,
        driver: Array.isArray(a.driver) ? a.driver[0] : a.driver,
        van: Array.isArray(a.van) ? a.van[0] : a.van,
        pad: Array.isArray(a.pad) ? a.pad[0] : a.pad,
        lot_spot: Array.isArray(a.lot_spot) ? a.lot_spot[0] : a.lot_spot,
      })
    );

    // Build lookup maps for matching
    const existingByRoute = new Map<string, ExistingAssignment>();
    const existingByVan = new Map<string, ExistingAssignment>();
    const existingByDriver = new Map<string, ExistingAssignment>();
    const matchedExistingIds = new Set<string>();

    for (const assignment of existing) {
      if (assignment.route_code) {
        existingByRoute.set(assignment.route_code.toLowerCase(), assignment);
      }
      if (assignment.van_id) {
        existingByVan.set(assignment.van_id, assignment);
      }
      if (assignment.driver_id) {
        existingByDriver.set(assignment.driver_id, assignment);
      }
    }

    const diffRows: DiffRow[] = [];

    // Process staged rows
    for (const staged of stagedData) {
      // Skip rows with errors
      if (staged.errors.length > 0) {
        continue;
      }

      // Try to match with existing assignment
      // Priority: route_code > van_id > driver_id
      let matchedAssignment: ExistingAssignment | null = null;

      if (staged.route_code) {
        const byRoute = existingByRoute.get(staged.route_code.toLowerCase());
        if (byRoute && !matchedExistingIds.has(byRoute.id)) {
          matchedAssignment = byRoute;
        }
      }

      if (!matchedAssignment && staged.van_id) {
        const byVan = existingByVan.get(staged.van_id);
        if (byVan && !matchedExistingIds.has(byVan.id)) {
          matchedAssignment = byVan;
        }
      }

      if (!matchedAssignment && staged.driver_id) {
        const byDriver = existingByDriver.get(staged.driver_id);
        if (byDriver && !matchedExistingIds.has(byDriver.id)) {
          matchedAssignment = byDriver;
        }
      }

      if (matchedAssignment) {
        matchedExistingIds.add(matchedAssignment.id);

        // Check what changed
        const changedFields: string[] = [];

        if (matchedAssignment.driver_id !== staged.driver_id) {
          changedFields.push("driver");
        }
        if (matchedAssignment.van_id !== staged.van_id) {
          changedFields.push("van");
        }
        if (
          matchedAssignment.route_code?.toLowerCase() !==
          staged.route_code?.toLowerCase()
        ) {
          changedFields.push("route_code");
        }
        if (matchedAssignment.pad_id !== staged.pad_id) {
          changedFields.push("pad");
        }
        if (matchedAssignment.dispatch_time !== staged.dispatch_time) {
          changedFields.push("dispatch_time");
        }
        if (matchedAssignment.cart_location !== staged.cart_location) {
          changedFields.push("cart_location");
        }
        if (matchedAssignment.lot_spot_id !== staged.lot_spot_id) {
          changedFields.push("lot_spot");
        }

        const action: DiffAction =
          changedFields.length > 0 ? "update" : "unchanged";

        diffRows.push({
          action,
          stagedRowIndex: staged.rowIndex,
          existingAssignmentId: matchedAssignment.id,
          before: {
            driver_name: matchedAssignment.driver?.display_name ?? null,
            van_label: matchedAssignment.van?.label ?? null,
            route_code: matchedAssignment.route_code,
            pad: matchedAssignment.pad?.name ?? null,
            dispatch_time: matchedAssignment.dispatch_time,
            cart_location: matchedAssignment.cart_location,
            parking_spot: matchedAssignment.lot_spot?.label ?? null,
          },
          after: {
            driver_name: staged.driver_name,
            van_label: staged.van_label,
            route_code: staged.route_code,
            pad: staged.pad,
            dispatch_time: staged.dispatch_time,
            cart_location: staged.cart_location,
            parking_spot: staged.parking_spot_label,
          },
          changedFields,
        });
      } else {
        // New assignment
        diffRows.push({
          action: "add",
          stagedRowIndex: staged.rowIndex,
          existingAssignmentId: null,
          before: null,
          after: {
            driver_name: staged.driver_name,
            van_label: staged.van_label,
            route_code: staged.route_code,
            pad: staged.pad,
            dispatch_time: staged.dispatch_time,
            cart_location: staged.cart_location,
            parking_spot: staged.parking_spot_label,
          },
          changedFields: [],
        });
      }
    }

    // Find removed assignments (in existing but not matched)
    for (const assignment of existing) {
      if (!matchedExistingIds.has(assignment.id)) {
        diffRows.push({
          action: "remove",
          stagedRowIndex: null,
          existingAssignmentId: assignment.id,
          before: {
            driver_name: assignment.driver?.display_name ?? null,
            van_label: assignment.van?.label ?? null,
            route_code: assignment.route_code,
            pad: assignment.pad?.name ?? null,
            dispatch_time: assignment.dispatch_time,
            cart_location: assignment.cart_location,
            parking_spot: assignment.lot_spot?.label ?? null,
          },
          after: null,
          changedFields: [],
        });
      }
    }

    // Calculate summary
    const summary: DiffSummary = {
      added: diffRows.filter((r) => r.action === "add").length,
      updated: diffRows.filter((r) => r.action === "update").length,
      removed: diffRows.filter((r) => r.action === "remove").length,
      unchanged: diffRows.filter((r) => r.action === "unchanged").length,
      unresolved: stagedData.filter(
        (r) => r.errors.length > 0 || (r.driver_name && !r.driver_resolved)
      ).length,
    };

    // Update the batch
    const { error: updateError } = await supabase
      .from("import_batches")
      .update({
        status: "diffed",
        diff_rows: diffRows,
        diff_summary: summary,
      })
      .eq("id", batchId);

    if (updateError) {
      console.error("[import-airlock/diff] Update failed", updateError);
      return NextResponse.json(
        { ok: false, error: "Failed to update import batch" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      data: {
        batchId,
        status: "diffed",
        summary,
        diffRows,
      },
    });
  } catch (err) {
    if (err instanceof Response) return err;

    console.error("[import-airlock/diff] Unhandled error", err);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
