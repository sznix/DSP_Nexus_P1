"use client";

import { useSyncContext } from "@/components/SyncProvider";
import type { SyncState } from "@/lib/sync";

/**
 * Hook to get the current sync status.
 * Returns status, pending count, last sync time, and any error.
 */
export function useSyncStatus(): SyncState {
  const { state } = useSyncContext();
  return state;
}
