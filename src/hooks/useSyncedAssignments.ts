"use client";

import { useState, useEffect } from "react";
import { useSyncContext } from "@/components/SyncProvider";
import type { AssignmentDoc } from "@/lib/sync";

type UseSyncedAssignmentsResult = {
  assignments: AssignmentDoc[];
  isLoading: boolean;
  error: string | null;
};

/**
 * Hook to get reactive assignments from RxDB for a specific date.
 * Assignments are sorted by zone_sort_order, then spot_sort_index (walking order).
 *
 * @param date - Date in YYYY-MM-DD format
 */
export function useSyncedAssignments(date: string): UseSyncedAssignmentsResult {
  const { db } = useSyncContext();
  const [assignments, setAssignments] = useState<AssignmentDoc[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!db) {
      setIsLoading(true);
      return;
    }

    setIsLoading(true);
    setError(null);

    // Subscribe to assignments for the given date
    const subscription = db.assignments
      .find({
        selector: {
          day_date: date,
          _deleted: { $ne: true },
        },
      })
      .$.subscribe({
        next: (docs) => {
          // Sort by zone_sort_order, then spot_sort_index
          const sorted = [...docs].sort((a, b) => {
            const aZone = a.zone_sort_order ?? 999;
            const bZone = b.zone_sort_order ?? 999;

            if (aZone !== bZone) {
              return aZone - bZone;
            }

            const aSpot = a.spot_sort_index ?? 999;
            const bSpot = b.spot_sort_index ?? 999;

            return aSpot - bSpot;
          });

          setAssignments(sorted.map((doc) => doc.toJSON() as AssignmentDoc));
          setIsLoading(false);
        },
        error: (err) => {
          console.error("[useSyncedAssignments] Query error", err);
          setError(err instanceof Error ? err.message : "Query failed");
          setIsLoading(false);
        },
      });

    return () => {
      subscription.unsubscribe();
    };
  }, [db, date]);

  return { assignments, isLoading, error };
}
