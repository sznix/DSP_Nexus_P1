/**
 * Client-side API helper functions.
 *
 * These helpers provide type-safe access to backend API routes.
 */

import type {
  CardStatus,
  KeyStatus,
  VerificationStatus,
} from "@/lib/constants";

/**
 * Assignment data as returned by the dispatch assignments API
 */
export type AssignmentData = {
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

/**
 * Zone data for lot topology
 */
export type ZoneData = {
  id: string;
  name: string;
  sort_order: number;
};

/**
 * Spot data for lot topology
 */
export type SpotData = {
  id: string;
  label: string;
  zone_id: string;
  sort_index: number;
};

/**
 * Response shape from GET /api/dispatch/assignments
 */
export type DispatchAssignmentsResponse = {
  date: string;
  assignments: AssignmentData[];
  topology: {
    pads: string[];
    zones: ZoneData[];
    spots: SpotData[];
  };
};

/**
 * API error response
 */
export type ApiError = {
  error: string;
  message?: string;
};

/**
 * Fetch dispatch assignments for a given date.
 *
 * @param date - Date in YYYY-MM-DD format
 * @returns Assignments and topology data
 * @throws Error if the request fails or returns an error
 *
 * @example
 * ```typescript
 * const { date, assignments, topology } = await fetchDispatchAssignments("2024-01-15");
 * ```
 */
export async function fetchDispatchAssignments(
  date: string
): Promise<DispatchAssignmentsResponse> {
  const res = await fetch(
    `/api/dispatch/assignments?date=${encodeURIComponent(date)}`,
    {
      method: "GET",
      credentials: "include",
    }
  );

  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as ApiError | null;
    throw new Error(data?.error ?? `Request failed with status ${res.status}`);
  }

  return res.json() as Promise<DispatchAssignmentsResponse>;
}
