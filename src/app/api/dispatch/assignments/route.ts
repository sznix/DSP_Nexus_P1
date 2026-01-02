import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayInTimeZone } from "@/lib/utils";
import { DISPATCH_ALLOWED_ROLES } from "@/lib/constants";
import type {
  CardStatus,
  KeyStatus,
  VerificationStatus,
} from "@/lib/constants";

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

// Types for the assignment response
type AssignmentRow = {
  id: string;
  pad: string | null;
  dispatch_time: string | null;
  cart_location: string | null;
  notes: string | null;
  key_status: KeyStatus | null;
  card_status: CardStatus | null;
  current_key_holder_id: string | null;
  verification_status: VerificationStatus | null;
  rollout_status: string | null;
  vans: { label: string } | null;
  drivers: { id: string; first_name: string; last_name: string } | null;
  lot_spots: {
    id: string;
    label: string;
    sort_index: number;
    lot_zones: { id: string; name: string; sort_order: number } | null;
  } | null;
};

type LotZone = {
  id: string;
  name: string;
  sort_order: number;
};

type LotSpot = {
  id: string;
  label: string;
  zone_id: string;
  sort_index: number;
};

/**
 * GET /api/dispatch/assignments?date=YYYY-MM-DD
 *
 * Returns assignments for a given date along with topology (pads, zones, spots).
 * Requires admin, manager, or dispatcher role.
 */
export async function GET(request: Request) {
  try {
    const user = await requireRole(DISPATCH_ALLOWED_ROLES);

    const url = new URL(request.url);
    const dateParam = url.searchParams.get("date");

    // Validate date parameter
    if (!dateParam) {
      return jsonNoStore(
        { error: "Missing required 'date' query parameter (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    if (!isValidDateParam(dateParam)) {
      return jsonNoStore(
        { error: "Invalid date format. Expected YYYY-MM-DD" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Query assignments with all fields needed for Snake Walk + Dispatch
    const { data: assignments, error: assignmentsError } = await supabase
      .from("daily_assignments")
      .select(
        `
        id,
        pad,
        dispatch_time,
        cart_location,
        notes,
        key_status,
        card_status,
        current_key_holder_id,
        verification_status,
        rollout_status,
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
      .eq("day_date", dateParam)
      .returns<AssignmentRow[]>();

    if (assignmentsError) {
      console.error("[dispatch.get] Failed to fetch assignments", {
        tenantId: user.tenantId,
        date: dateParam,
        error: assignmentsError,
      });
      return jsonNoStore({ error: "Failed to fetch assignments" }, { status: 500 });
    }

    // Query zones for topology
    const { data: zones, error: zonesError } = await supabase
      .from("lot_zones")
      .select("id, name, sort_order")
      .eq("tenant_id", user.tenantId)
      .order("sort_order", { ascending: true })
      .returns<LotZone[]>();

    if (zonesError) {
      console.error("[dispatch.get] Failed to fetch zones", {
        tenantId: user.tenantId,
        error: zonesError,
      });
      return jsonNoStore({ error: "Failed to fetch topology" }, { status: 500 });
    }

    // Query spots for topology
    const { data: spots, error: spotsError } = await supabase
      .from("lot_spots")
      .select("id, label, zone_id, sort_index")
      .order("sort_index", { ascending: true })
      .returns<LotSpot[]>();

    if (spotsError) {
      console.error("[dispatch.get] Failed to fetch spots", {
        tenantId: user.tenantId,
        error: spotsError,
      });
      return jsonNoStore({ error: "Failed to fetch topology" }, { status: 500 });
    }

    // Extract unique pads from assignments
    const padsSet = new Set<string>();
    for (const a of assignments ?? []) {
      if (a.pad) {
        padsSet.add(a.pad);
      }
    }
    const pads = Array.from(padsSet).sort();

    // Sort assignments by zone.sort_order then spot.sort_index (walking order)
    const sortedAssignments = (assignments ?? []).sort((a, b) => {
      const aZoneOrder = a.lot_spots?.lot_zones?.sort_order ?? 999;
      const bZoneOrder = b.lot_spots?.lot_zones?.sort_order ?? 999;

      if (aZoneOrder !== bZoneOrder) {
        return aZoneOrder - bZoneOrder;
      }

      const aSpotIndex = a.lot_spots?.sort_index ?? 999;
      const bSpotIndex = b.lot_spots?.sort_index ?? 999;

      return aSpotIndex - bSpotIndex;
    });

    return jsonNoStore({
      date: dateParam,
      assignments: sortedAssignments,
      topology: {
        pads,
        zones: zones ?? [],
        spots: spots ?? [],
      },
    });
  } catch (err) {
    if (err instanceof Response) return err;

    console.error("[dispatch.get] Unhandled error", err);
    return jsonNoStore({ error: "Internal server error" }, { status: 500 });
  }
}
