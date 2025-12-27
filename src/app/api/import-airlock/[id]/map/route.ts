/**
 * POST /api/import-airlock/:id/map
 *
 * Apply column mappings and resolve entity names (drivers, vans, pads).
 * Requires admin or manager role.
 */

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type {
  ColumnMapping,
  StagedRow,
  RawDataRow,
  NormalizedField,
  MapColumnsRequest,
} from "@/lib/import-airlock";
import {
  resolveDriverName,
  resolveVan,
  resolvePad,
  resolveLotSpot,
  normalizeName,
  type DriverRecord,
  type DriverAliasRecord,
  type VanRecord,
  type PadRecord,
  type LotSpotRecord,
} from "@/lib/import-airlock";

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

    const body = await request.json().catch(() => null);

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "Invalid request body" },
        { status: 400 }
      );
    }

    const { columnMappings } = body as MapColumnsRequest;

    if (!columnMappings || !Array.isArray(columnMappings)) {
      return NextResponse.json(
        { ok: false, error: "Missing columnMappings array" },
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
    if (batch.status !== "pending" && batch.status !== "mapped") {
      return NextResponse.json(
        {
          ok: false,
          error: `Cannot map batch with status '${batch.status}'. Expected 'pending' or 'mapped'.`,
        },
        { status: 400 }
      );
    }

    // Fetch reference data for resolution
    const [driversResult, aliasesResult, vansResult, padsResult, spotsResult] =
      await Promise.all([
        supabase
          .from("drivers")
          .select("id, display_name, first_name, last_name, active")
          .eq("tenant_id", user.tenantId),
        supabase
          .from("driver_aliases")
          .select("id, driver_id, alias, normalized_alias")
          .eq("tenant_id", user.tenantId),
        supabase
          .from("vans")
          .select("id, label, vin, active")
          .eq("tenant_id", user.tenantId),
        supabase
          .from("pads")
          .select("id, name, sort_order")
          .eq("tenant_id", user.tenantId),
        supabase
          .from("lot_spots")
          .select("id, label, zone_id"),
      ]);

    const drivers: DriverRecord[] = driversResult.data ?? [];
    const aliases: DriverAliasRecord[] = aliasesResult.data ?? [];
    const vans: VanRecord[] = vansResult.data ?? [];
    const pads: PadRecord[] = padsResult.data ?? [];
    const spots: LotSpotRecord[] = spotsResult.data ?? [];

    // Build mapping lookup
    const mappingBySource = new Map<string, ColumnMapping>();
    for (const mapping of columnMappings) {
      mappingBySource.set(mapping.sourceHeader, mapping);
    }

    // Build reverse lookup: target field -> source header
    const sourceByTarget = new Map<NormalizedField, string>();
    for (const mapping of columnMappings) {
      if (mapping.targetField && !mapping.ignored) {
        sourceByTarget.set(mapping.targetField, mapping.sourceHeader);
      }
    }

    // Process raw data into staged rows
    const rawData = batch.raw_data as RawDataRow[];
    const stagedData: StagedRow[] = [];
    const newDriversToCreate: Array<{
      rowIndex: number;
      inputName: string;
      normalizedName: string;
    }> = [];

    for (let i = 0; i < rawData.length; i++) {
      const rawRow = rawData[i]!;

      // Extract values using mappings
      const getValue = (field: NormalizedField): string | null => {
        const sourceHeader = sourceByTarget.get(field);
        if (!sourceHeader) return null;
        return rawRow[sourceHeader]?.trim() || null;
      };

      const staged: StagedRow = {
        rowIndex: i,
        work_date: getValue("work_date") ?? batch.work_date,
        driver_name: getValue("driver_name"),
        van_label: getValue("van_label"),
        vin: getValue("vin"),
        route_code: getValue("route_code"),
        pad: getValue("pad"),
        dispatch_time: getValue("dispatch_time"),
        cart_location: getValue("cart_location"),
        parking_spot_label: getValue("parking_spot_label"),
        driver_id: null,
        driver_resolved: false,
        driver_match_type: null,
        van_id: null,
        van_resolved: false,
        pad_id: null,
        pad_resolved: false,
        lot_spot_id: null,
        spot_resolved: false,
        errors: [],
        warnings: [],
      };

      // Resolve driver
      if (staged.driver_name) {
        const driverResult = resolveDriverName(
          staged.driver_name,
          drivers,
          aliases
        );
        staged.driver_resolved = driverResult.resolved;
        staged.driver_id = driverResult.driverId;
        staged.driver_match_type = driverResult.matchType;

        if (!driverResult.resolved && driverResult.suggestions.length === 0) {
          // Mark for new driver creation
          newDriversToCreate.push({
            rowIndex: i,
            inputName: staged.driver_name,
            normalizedName: normalizeName(staged.driver_name),
          });
          staged.warnings.push(
            `Driver "${staged.driver_name}" not found. Will create new driver on publish.`
          );
        } else if (!driverResult.resolved) {
          staged.warnings.push(
            `Driver "${staged.driver_name}" has low confidence matches. Please review.`
          );
        }
      }

      // Resolve van (try label first, then VIN)
      const vanInput = staged.van_label || staged.vin;
      if (vanInput) {
        const vanResult = resolveVan(vanInput, vans);
        staged.van_resolved = vanResult.resolved;
        staged.van_id = vanResult.vanId;
        if (!vanResult.resolved) {
          staged.warnings.push(`Van "${vanInput}" not found.`);
        }
      }

      // Resolve pad
      if (staged.pad) {
        const padResult = resolvePad(staged.pad, pads);
        staged.pad_resolved = padResult.resolved;
        staged.pad_id = padResult.padId;
        if (!padResult.resolved) {
          staged.warnings.push(`Pad "${staged.pad}" not found.`);
        }
      }

      // Resolve lot spot
      if (staged.parking_spot_label) {
        const spotResult = resolveLotSpot(staged.parking_spot_label, spots);
        staged.spot_resolved = spotResult.resolved;
        staged.lot_spot_id = spotResult.lotSpotId;
        if (!spotResult.resolved) {
          staged.warnings.push(
            `Parking spot "${staged.parking_spot_label}" not found.`
          );
        }
      }

      // Validate required fields
      if (!staged.route_code) {
        staged.errors.push("Missing route code");
      }

      stagedData.push(staged);
    }

    // Count resolution stats
    const stats = {
      totalRows: stagedData.length,
      driversResolved: stagedData.filter((r) => r.driver_resolved).length,
      driversUnresolved: stagedData.filter(
        (r) => r.driver_name && !r.driver_resolved
      ).length,
      vansResolved: stagedData.filter((r) => r.van_resolved).length,
      vansUnresolved: stagedData.filter(
        (r) => (r.van_label || r.vin) && !r.van_resolved
      ).length,
      padsResolved: stagedData.filter((r) => r.pad_resolved).length,
      spotsResolved: stagedData.filter((r) => r.spot_resolved).length,
      rowsWithErrors: stagedData.filter((r) => r.errors.length > 0).length,
      rowsWithWarnings: stagedData.filter((r) => r.warnings.length > 0).length,
      newDriversToCreate: newDriversToCreate.length,
    };

    // Update the batch
    const { error: updateError } = await supabase
      .from("import_batches")
      .update({
        status: "mapped",
        column_mappings: columnMappings,
        staged_data: stagedData,
      })
      .eq("id", batchId);

    if (updateError) {
      console.error("[import-airlock/map] Update failed", updateError);
      return NextResponse.json(
        { ok: false, error: "Failed to update import batch" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      data: {
        batchId,
        status: "mapped",
        stats,
        newDriversToCreate: newDriversToCreate.map((d) => ({
          rowIndex: d.rowIndex,
          inputName: d.inputName,
        })),
      },
    });
  } catch (err) {
    if (err instanceof Response) return err;

    console.error("[import-airlock/map] Unhandled error", err);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
