import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DISPATCH_ALLOWED_ROLES } from "@/lib/constants";
import type { AssignmentDoc, PullRequest, PullResponse } from "@/lib/sync/types";

/**
 * Response helper that always sets Cache-Control: no-store
 */
function jsonNoStore(
  body: unknown,
  init?: { status?: number; headers?: Record<string, string> }
) {
  return NextResponse.json(body, {
    ...init,
    headers: { ...(init?.headers ?? {}), "Cache-Control": "no-store" },
  });
}

/**
 * Validate YYYY-MM-DD date string format
 */
function isValidDateParam(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return false;
  }

  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

// Raw row type from Supabase query
type AssignmentRow = {
  id: string;
  tenant_id: string;
  day_date: string;
  pad: string | null;
  dispatch_time: string | null;
  cart_location: string | null;
  notes: string | null;
  key_status: string | null;
  card_status: string | null;
  current_key_holder_id: string | null;
  verification_status: string | null;
  rollout_status: string | null;
  updated_at: string;
  vans: { label: string } | null;
  drivers: { id: string; first_name: string; last_name: string } | null;
  lot_spots: {
    id: string;
    label: string;
    sort_index: number;
    lot_zones: { id: string; name: string; sort_order: number } | null;
  } | null;
};

/**
 * Denormalize a row from Supabase into the flat AssignmentDoc format.
 */
function denormalizeRow(row: AssignmentRow): AssignmentDoc {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    day_date: row.day_date,
    pad: row.pad,
    dispatch_time: row.dispatch_time,
    cart_location: row.cart_location,
    notes: row.notes,
    van_label: row.vans?.label ?? null,
    driver_id: row.drivers?.id ?? null,
    driver_name: row.drivers
      ? `${row.drivers.first_name} ${row.drivers.last_name}`
      : null,
    spot_id: row.lot_spots?.id ?? null,
    spot_label: row.lot_spots?.label ?? null,
    spot_sort_index: row.lot_spots?.sort_index ?? 999,
    zone_id: row.lot_spots?.lot_zones?.id ?? null,
    zone_name: row.lot_spots?.lot_zones?.name ?? null,
    zone_sort_order: row.lot_spots?.lot_zones?.sort_order ?? 999,
    key_status: row.key_status as AssignmentDoc["key_status"],
    card_status: row.card_status as AssignmentDoc["card_status"],
    current_key_holder_id: row.current_key_holder_id,
    verification_status: row.verification_status as AssignmentDoc["verification_status"],
    rollout_status: row.rollout_status,
    updated_at: row.updated_at,
    _local_updated_at: 0,
    _pending_sync: false,
    _deleted: false,
  };
}

/**
 * POST /api/sync/pull
 *
 * Pull changes from server for a specific date.
 * Uses checkpoint-based pagination to fetch incremental updates.
 */
export async function POST(request: Request) {
  try {
    const user = await requireRole(DISPATCH_ALLOWED_ROLES);

    const body = await request.json().catch(() => null);

    if (!body || typeof body !== "object") {
      return jsonNoStore({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { date, checkpoint, limit = 100 } = body as PullRequest;

    // Validate date
    if (!date || !isValidDateParam(date)) {
      return jsonNoStore(
        { error: "Invalid or missing 'date' parameter (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    // Validate limit
    const parsedLimit = Math.min(Math.max(1, Number(limit) || 100), 500);

    const supabase = await createClient();

    // Build query
    let query = supabase
      .from("daily_assignments")
      .select(
        `
        id,
        tenant_id,
        day_date,
        pad,
        dispatch_time,
        cart_location,
        notes,
        key_status,
        card_status,
        current_key_holder_id,
        verification_status,
        rollout_status,
        updated_at,
        vans (
          label
        ),
        drivers (
          id,
          first_name,
          last_name
        ),
        lot_spots (
          id,
          label,
          sort_index,
          lot_zones (
            id,
            name,
            sort_order
          )
        )
      `
      )
      .eq("tenant_id", user.tenantId)
      .eq("day_date", date)
      .order("updated_at", { ascending: true })
      .limit(parsedLimit + 1); // Fetch one extra to detect hasMore

    // Add checkpoint filter if provided
    if (checkpoint) {
      query = query.gt("updated_at", checkpoint);
    }

    const { data: rows, error: queryError } = await query.returns<AssignmentRow[]>();

    if (queryError) {
      console.error("[sync.pull] Query failed", {
        tenantId: user.tenantId,
        date,
        error: queryError,
      });
      return jsonNoStore({ error: "Query failed" }, { status: 500 });
    }

    // Determine if there are more records
    const hasMore = (rows?.length ?? 0) > parsedLimit;
    const resultRows = hasMore ? rows!.slice(0, parsedLimit) : rows ?? [];

    // Denormalize rows
    const assignments = resultRows.map(denormalizeRow);

    // Calculate new checkpoint (max updated_at from results)
    let newCheckpoint = checkpoint ?? new Date(0).toISOString();
    if (assignments.length > 0) {
      newCheckpoint = assignments[assignments.length - 1].updated_at;
    }

    const response: PullResponse = {
      assignments,
      checkpoint: newCheckpoint,
      hasMore,
    };

    return jsonNoStore(response);
  } catch (err) {
    if (err instanceof Response) return err;

    console.error("[sync.pull] Unhandled error", err);
    return jsonNoStore({ error: "Internal server error" }, { status: 500 });
  }
}
