"use client";

import { useCallback } from "react";
import { useSyncContext } from "@/components/SyncProvider";
import {
  toggleKeyStatus,
  cycleCardStatus,
  toggleVerificationStatus,
  transferKeysToDriver,
  returnKeysToStation,
  applyLocalMutation,
} from "@/lib/sync";

/**
 * Hook to perform offline-capable mutations on assignments.
 * Mutations are applied locally immediately and synced to server when online.
 */
export function useOfflineMutation() {
  const { db, triggerPush } = useSyncContext();

  const toggleKey = useCallback(
    async (
      assignmentId: string,
      currentStatus: string | null,
      driverId: string | null
    ) => {
      if (!db) throw new Error("Database not initialized");
      await toggleKeyStatus(db, assignmentId, currentStatus, driverId);
      triggerPush();
    },
    [db, triggerPush]
  );

  const cycleCard = useCallback(
    async (assignmentId: string, currentStatus: string | null) => {
      if (!db) throw new Error("Database not initialized");
      await cycleCardStatus(db, assignmentId, currentStatus);
      triggerPush();
    },
    [db, triggerPush]
  );

  const toggleVerify = useCallback(
    async (assignmentId: string, currentStatus: string | null) => {
      if (!db) throw new Error("Database not initialized");
      await toggleVerificationStatus(db, assignmentId, currentStatus);
      triggerPush();
    },
    [db, triggerPush]
  );

  const transferKeys = useCallback(
    async (assignmentId: string, driverId: string) => {
      if (!db) throw new Error("Database not initialized");
      await transferKeysToDriver(db, assignmentId, driverId);
      triggerPush();
    },
    [db, triggerPush]
  );

  const returnKeys = useCallback(
    async (assignmentId: string) => {
      if (!db) throw new Error("Database not initialized");
      await returnKeysToStation(db, assignmentId);
      triggerPush();
    },
    [db, triggerPush]
  );

  const applyPatch = useCallback(
    async (assignmentId: string, patch: Record<string, unknown>) => {
      if (!db) throw new Error("Database not initialized");
      await applyLocalMutation(db, assignmentId, patch);
      triggerPush();
    },
    [db, triggerPush]
  );

  return {
    toggleKey,
    cycleCard,
    toggleVerify,
    transferKeys,
    returnKeys,
    applyPatch,
  };
}
