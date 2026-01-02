import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  DISPATCH_ALLOWED_ROLES,
  DISPATCHER_PATCHABLE_COLUMNS,
  getDisallowedColumns,
  KEY_STATUS,
  VERIFICATION_STATUS,
} from "@/lib/constants";
import type {
  PushRequest,
  PushResponse,
  PushMutation,
  PushMutationResult,
  AssignmentDoc,
} from "@/lib/sync/types";

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

// Raw row type for fetching current state
type AssignmentRow = {
  id: string;
  tenant_id: string;
  day_date: string;
  driver_id: string | null;
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
 * Denormalize a row into AssignmentDoc format.
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
 * POST /api/sync/push
 *
 * Push pending mutations from client.
 * Validates each mutation against the dispatcher whitelist.
 * Uses last-write-wins conflict resolution.
 */
export async function POST(request: Request) {
  try {
    const user = await requireRole(DISPATCH_ALLOWED_ROLES);

    const body = await request.json().catch(() => null);

    if (!body || typeof body !== "object") {
      return jsonNoStore({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { mutations } = body as PushRequest;

    if (!Array.isArray(mutations) || mutations.length === 0) {
      return jsonNoStore(
        { error: "Missing or empty 'mutations' array" },
        { status: 400 }
      );
    }

    // Limit batch size
    if (mutations.length > 50) {
      return jsonNoStore(
        { error: "Too many mutations (max 50 per request)" },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const results: PushMutationResult[] = [];
    const nowIso = new Date().toISOString();

    for (const mutation of mutations) {
      const result = await processMutation(
        supabase,
        user.tenantId,
        user.userId,
        mutation,
        nowIso
      );
      results.push(result);
    }

    const response: PushResponse = { results };
    return jsonNoStore(response);
  } catch (err) {
    if (err instanceof Response) return err;

    console.error("[sync.push] Unhandled error", err);
    return jsonNoStore({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * Process a single mutation.
 */
async function processMutation(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  userId: string,
  mutation: PushMutation,
  nowIso: string
): Promise<PushMutationResult> {
  const { id: mutationId, assignment_id, patch, timestamp } = mutation;

  // Validate mutation structure
  if (!mutationId || !assignment_id || !patch || typeof patch !== "object") {
    return {
      mutation_id: mutationId ?? "unknown",
      status: "rejected",
      error: "Invalid mutation structure",
    };
  }

  // Validate patch against dispatcher whitelist
  const disallowed = getDisallowedColumns(patch);
  if (disallowed.length > 0) {
    return {
      mutation_id: mutationId,
      status: "rejected",
      error: `Forbidden fields: ${disallowed.join(", ")}. Allowed: ${DISPATCHER_PATCHABLE_COLUMNS.join(", ")}`,
    };
  }

  // Fetch current state of assignment (with tenant check)
  const { data: current, error: fetchError } = await supabase
    .from("daily_assignments")
    .select(
      `
      id,
      tenant_id,
      day_date,
      driver_id,
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
    .eq("id", assignment_id)
    .eq("tenant_id", tenantId)
    .single<AssignmentRow>();

  if (fetchError || !current) {
    return {
      mutation_id: mutationId,
      status: "rejected",
      error: "Assignment not found or access denied",
    };
  }

  // Conflict detection: check if server is newer than client mutation
  const serverUpdatedAt = new Date(current.updated_at).getTime();
  if (timestamp <= serverUpdatedAt) {
    // Conflict: server has newer changes
    return {
      mutation_id: mutationId,
      status: "conflict",
      server_doc: denormalizeRow(current),
    };
  }

  // Apply server-side business logic (same as PATCH endpoint)
  const patchToApply: Record<string, unknown> = { ...patch };

  // Verification: stamp who/when if marking as verified
  if (patchToApply.verification_status === VERIFICATION_STATUS.VERIFIED) {
    if (!("verification_timestamp" in patchToApply)) {
      patchToApply.verification_timestamp = nowIso;
    }
    if (!("verification_user_id" in patchToApply)) {
      patchToApply.verification_user_id = userId;
    }
  }

  // Rollout: stamp who/when if marking as complete
  if (patchToApply.rollout_status === "complete") {
    if (!("rollout_timestamp" in patchToApply)) {
      patchToApply.rollout_timestamp = nowIso;
    }
    if (!("rollout_user_id" in patchToApply)) {
      patchToApply.rollout_user_id = userId;
    }
  }

  // Keys: enforce sane pairing of key_status + current_key_holder_id
  if (patchToApply.key_status === KEY_STATUS.STATION) {
    patchToApply.current_key_holder_id = null;
  }

  if (patchToApply.key_status === KEY_STATUS.WITH_DRIVER) {
    if (
      !("current_key_holder_id" in patchToApply) ||
      patchToApply.current_key_holder_id == null
    ) {
      // Default to the assigned driver_id
      if (current.driver_id) {
        patchToApply.current_key_holder_id = current.driver_id;
      }
    }
  }

  // Apply the update
  const { error: updateError } = await supabase
    .from("daily_assignments")
    .update(patchToApply)
    .eq("id", assignment_id)
    .eq("tenant_id", tenantId);

  if (updateError) {
    console.error("[sync.push] Update failed", {
      mutationId,
      assignmentId: assignment_id,
      error: updateError,
    });
    return {
      mutation_id: mutationId,
      status: "rejected",
      error: "Update failed",
    };
  }

  return {
    mutation_id: mutationId,
    status: "accepted",
  };
}
