import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  DISPATCHER_PATCHABLE_COLUMNS,
  getDisallowedColumns,
  isValidDispatcherPatch,
} from "@/lib/constants";

/**
 * PATCH /api/dispatch/assignments/:id
 *
 * Purpose: dispatcher/manager/admin "checkoff" updates only.
 * We intentionally restrict this endpoint to the dispatcher patch whitelist,
 * even for admin/manager, to keep the blast radius small.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(["admin", "manager", "dispatcher"]);
    const { id: assignmentId } = await params;

    if (!assignmentId) {
      return NextResponse.json(
        { error: "Missing assignment id" },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => null);

    // Runtime guard: body must be a plain object
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { error: "Invalid JSON body. Expected an object." },
        { status: 400 }
      );
    }

    // Accept either { patch: {...} } or just {...}
    const bodyObj = body as Record<string, unknown>;
    const patchCandidate = "patch" in bodyObj ? bodyObj.patch : bodyObj;

    // Runtime guard: patch must be a plain object
    if (
      !patchCandidate ||
      typeof patchCandidate !== "object" ||
      Array.isArray(patchCandidate)
    ) {
      return NextResponse.json(
        { error: "Invalid patch. Expected a plain object." },
        { status: 400 }
      );
    }

    const patch: Record<string, unknown> = patchCandidate as Record<string, unknown>;

    const keys = Object.keys(patch);
    if (keys.length === 0) {
      return NextResponse.json(
        { error: "Empty patch. Provide at least one field to update." },
        { status: 400 }
      );
    }

    // Extra safety: restrict this endpoint to the dispatcher whitelist for ALL roles.
    // (Admin/Manager will get separate admin edit endpoints later.)
    const disallowed = getDisallowedColumns(patch);
    if (disallowed.length > 0) {
      return NextResponse.json(
        {
          error: "Forbidden fields in patch",
          disallowed,
          allowed: DISPATCHER_PATCHABLE_COLUMNS,
        },
        { status: 403 }
      );
    }

    // Dispatcher-specific check (redundant with the above allowlist, but explicit).
    if (user.role === "dispatcher" && !isValidDispatcherPatch(patch)) {
      return NextResponse.json(
        { error: "Forbidden fields in patch (dispatcher)" },
        { status: 403 }
      );
    }

    const supabase = await createClient();

    // Server-side convenience stamping (keeps client thin & consistent)
    const nowIso = new Date().toISOString();

    // Verification: if a dispatcher marks verified, stamp who/when
    if (patch.verification_status === "verified") {
      if (!("verification_timestamp" in patch)) {
        patch.verification_timestamp = nowIso;
      }
      if (!("verification_user_id" in patch)) {
        patch.verification_user_id = user.userId;
      }
    }

    // Rollout: if a dispatcher marks rollout complete, stamp who/when
    if (patch.rollout_status === "complete") {
      if (!("rollout_timestamp" in patch)) {
        patch.rollout_timestamp = nowIso;
      }
      if (!("rollout_user_id" in patch)) {
        patch.rollout_user_id = user.userId;
      }
    }

    // Keys: enforce sane pairing of key_status + current_key_holder_id
    if (patch.key_status === "STATION") {
      // Returning keys clears current holder
      patch.current_key_holder_id = null;
    }

    if (patch.key_status === "WITH_DRIVER") {
      // If client didn't specify a holder, default to the assigned driver_id (if any)
      if (!("current_key_holder_id" in patch) || patch.current_key_holder_id == null) {
        const { data: row, error: rowError } = await supabase
          .from("daily_assignments")
          .select("driver_id")
          .eq("id", assignmentId)
          .single();

        if (!rowError && row?.driver_id) {
          patch.current_key_holder_id = row.driver_id;
        }
      }
    }

    const { data, error } = await supabase
      .from("daily_assignments")
      .update(patch)
      .eq("id", assignmentId)
      .select("id")
      .single();

    if (error) {
      // Don't leak internal schema details to clients
      console.error("[dispatch.patch] Update failed", {
        assignmentId,
        userId: user.userId,
        role: user.role,
        error,
      });
      return NextResponse.json(
        { error: "Update failed" },
        { status: 400 }
      );
    }

    if (!data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, id: data.id });
  } catch (err) {
    if (err instanceof Response) return err;

    console.error("[dispatch.patch] Unhandled error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
