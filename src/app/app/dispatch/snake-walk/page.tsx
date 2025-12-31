import { todayInTimeZone, formatDateForDisplay } from "@/lib/utils";
import AppHeader from "@/components/AppHeader";
import SnakeWalkCard from "@/components/SnakeWalkCard";
import { requirePageRole } from "@/lib/page-auth";
import { DISPATCH_ALLOWED_ROLES, type CardStatus, type KeyStatus, type VerificationStatus } from "@/lib/constants";

export const dynamic = "force-dynamic";

type DailyAssignment = {
  id: string;
  pad: string | null;
  dispatch_time: string | null;
  cart_location: string | null;

  // Checkoff state
  key_status: KeyStatus | null;
  card_status: CardStatus | null;
  current_key_holder_id: string | null;
  verification_status: VerificationStatus | null;

  vans: {
    label: string;
  } | null;

  drivers: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;

  lot_spots: {
    label: string;
    sort_index: number;
    lot_zones: {
      name: string;
      sort_order: number;
    } | null;
  } | null;
};

export default async function SnakeWalkPage() {
  const { supabase, tenantId, tenantName } = await requirePageRole(
    DISPATCH_ALLOWED_ROLES
  );

  // Use timezone-aware date for consistent querying
  const today = todayInTimeZone();
  const displayDate = formatDateForDisplay();

  // Query daily_assignments for today
  // NOTE: Prefer snake_walk_view if available in the future for better performance
  const { data: assignments, error: assignmentsError } = await supabase
    .from("daily_assignments")
    .select(
      `
      id,
      pad,
      dispatch_time,
      cart_location,
      card_status,
      key_status,
      current_key_holder_id,
      verification_status,
      vans (
        label
      ),
      drivers (
        id,
        first_name,
        last_name
      ),
      lot_spots (
        label,
        sort_index,
        lot_zones (
          name,
          sort_order
        )
      )
    `
    )
    .eq("tenant_id", tenantId)
    .eq("day_date", today)
    .returns<DailyAssignment[]>();

  if (assignmentsError) {
    console.error("[snake-walk] Failed to fetch assignments", {
      tenantId,
      error: assignmentsError,
    });
  }

  // Sort by zone.sort_order asc, then spot.sort_index asc (walking order)
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

  // Count assignments with retrieval barriers
  const barrierCount = sortedAssignments.filter(
    (a) =>
      a.key_status === "WITH_DRIVER" &&
      a.drivers?.id &&
      a.current_key_holder_id &&
      a.drivers.id !== a.current_key_holder_id
  ).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800">
      <AppHeader title="Snake Walk" tenantName={tenantName} showBackButton />

      {/* Main Content - optimized for mobile */}
      <main className="max-w-lg mx-auto px-4 py-4 pb-20">
        {/* Date header */}
        <div className="mb-4">
          <p className="text-slate-400 text-sm">{displayDate}</p>
          <div className="flex items-center justify-between mt-1">
            <span className="text-white text-sm font-medium">
              {sortedAssignments.length} assignments
            </span>
            {barrierCount > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-full bg-red-500/20 text-red-300 border border-red-500/30">
                <svg
                  className="w-3 h-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01"
                  />
                </svg>
                {barrierCount} barrier{barrierCount > 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>

        {assignmentsError ? (
          <div className="bg-red-500/20 border border-red-500/30 rounded-xl p-6 text-red-200">
            <p className="font-semibold mb-1">Error loading assignments</p>
            <p className="text-sm">Please refresh the page to try again.</p>
          </div>
        ) : sortedAssignments.length === 0 ? (
          <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-8 text-center">
            <svg
              className="w-12 h-12 mx-auto text-slate-500 mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
            <h3 className="text-lg font-semibold text-white mb-2">
              No Assignments Today
            </h3>
            <p className="text-slate-400 text-sm">
              There are no dispatch assignments for today.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedAssignments.map((assignment) => (
              <SnakeWalkCard
                key={assignment.id}
                assignmentId={assignment.id}
                spotLabel={assignment.lot_spots?.label ?? null}
                zoneName={assignment.lot_spots?.lot_zones?.name ?? null}
                vanLabel={assignment.vans?.label ?? null}
                driverName={
                  assignment.drivers
                    ? `${assignment.drivers.first_name} ${assignment.drivers.last_name}`
                    : null
                }
                driverId={assignment.drivers?.id ?? null}
                pad={assignment.pad}
                dispatchTime={assignment.dispatch_time}
                cartLocation={assignment.cart_location}
                keyStatus={assignment.key_status}
                cardStatus={assignment.card_status}
                verificationStatus={assignment.verification_status}
                currentKeyHolderId={assignment.current_key_holder_id}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
