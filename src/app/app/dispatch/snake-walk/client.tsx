"use client";

import { todayInTimeZone, formatDateForDisplay } from "@/lib/utils";
import AppHeader from "@/components/AppHeader";
import SnakeWalkCard from "@/components/SnakeWalkCard";
import { SyncStatusBadge } from "@/components/SyncStatusBadge";
import { useSyncedAssignments } from "@/hooks/useSyncedAssignments";
import { KEY_STATUS } from "@/lib/constants";

type Props = {
  tenantName: string;
};

/**
 * Snake Walk client component - renders assignments from RxDB.
 * Data is reactive and updates automatically when local or synced changes occur.
 */
export function SnakeWalkClient({ tenantName }: Props) {
  const today = todayInTimeZone();
  const displayDate = formatDateForDisplay();
  const { assignments, isLoading, error } = useSyncedAssignments(today);

  // Count assignments with retrieval barriers
  const barrierCount = assignments.filter(
    (a) =>
      a.key_status === KEY_STATUS.WITH_DRIVER &&
      a.driver_id &&
      a.current_key_holder_id &&
      a.driver_id !== a.current_key_holder_id
  ).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800">
      <AppHeader title="Snake Walk" tenantName={tenantName} showBackButton />

      {/* Main Content - optimized for mobile */}
      <main className="max-w-lg mx-auto px-4 py-4 pb-20">
        {/* Date header with sync status */}
        <div className="mb-4">
          <div className="flex items-center justify-between">
            <p className="text-slate-400 text-sm">{displayDate}</p>
            <SyncStatusBadge />
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-white text-sm font-medium">
              {isLoading ? "Loading..." : `${assignments.length} assignments`}
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

        {error ? (
          <div className="bg-red-500/20 border border-red-500/30 rounded-xl p-6 text-red-200">
            <p className="font-semibold mb-1">Error loading assignments</p>
            <p className="text-sm">{error}</p>
          </div>
        ) : isLoading ? (
          <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-8 text-center">
            <div className="w-8 h-8 border-2 border-slate-400 border-t-white rounded-full animate-spin mx-auto mb-4" />
            <p className="text-slate-400 text-sm">Loading assignments...</p>
          </div>
        ) : assignments.length === 0 ? (
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
            {assignments.map((assignment) => (
              <SnakeWalkCard
                key={assignment.id}
                assignmentId={assignment.id}
                spotLabel={assignment.spot_label}
                zoneName={assignment.zone_name}
                vanLabel={assignment.van_label}
                driverName={assignment.driver_name}
                driverId={assignment.driver_id}
                pad={assignment.pad}
                dispatchTime={assignment.dispatch_time}
                cartLocation={assignment.cart_location}
                keyStatus={assignment.key_status}
                cardStatus={assignment.card_status}
                verificationStatus={assignment.verification_status}
                currentKeyHolderId={assignment.current_key_holder_id}
                pendingSync={assignment._pending_sync}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
