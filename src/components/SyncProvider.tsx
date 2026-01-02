"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import type { SyncDatabase, SyncState, SyncStatus } from "@/lib/sync";
import { getDatabase, pullChanges, pushMutations, getPendingCount } from "@/lib/sync";
import { todayInTimeZone } from "@/lib/utils";

type SyncContextType = {
  db: SyncDatabase | null;
  state: SyncState;
  triggerSync: () => Promise<void>;
  triggerPush: () => Promise<void>;
};

const SyncContext = createContext<SyncContextType | null>(null);

const SYNC_INTERVAL_MS = 30000; // 30 seconds
const PUSH_DEBOUNCE_MS = 2000; // 2 seconds after last mutation

type SyncProviderProps = {
  children: ReactNode;
  tenantId: string;
};

export function SyncProvider({ children, tenantId }: SyncProviderProps) {
  const [db, setDb] = useState<SyncDatabase | null>(null);
  const [state, setState] = useState<SyncState>({
    status: "offline",
    pendingCount: 0,
    lastSyncAt: null,
    error: null,
  });

  const checkpointRef = useRef<string | undefined>(undefined);
  const pushTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize database
  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        const database = await getDatabase(tenantId);
        if (mounted) {
          setDb(database);
          setStatus("online");
        }
      } catch (error) {
        console.error("[SyncProvider] Failed to initialize database", error);
        if (mounted) {
          setState((prev) => ({
            ...prev,
            status: "error",
            error: "Failed to initialize local database",
          }));
        }
      }
    }

    init();

    return () => {
      mounted = false;
    };
  }, [tenantId]);

  // Helper to update status
  const setStatus = useCallback((status: SyncStatus, error?: string) => {
    setState((prev) => ({
      ...prev,
      status,
      error: error ?? null,
    }));
  }, []);

  // Update pending count
  const updatePendingCount = useCallback(async () => {
    if (!db) return;
    const count = await getPendingCount(db);
    setState((prev) => ({ ...prev, pendingCount: count }));
  }, [db]);

  // Online/offline detection
  useEffect(() => {
    function handleOnline() {
      setStatus("online");
      // Trigger sync when coming back online
      triggerSync();
    }

    function handleOffline() {
      setStatus("offline");
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Set initial status
    if (navigator.onLine) {
      setStatus("online");
    } else {
      setStatus("offline");
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [setStatus]);

  // Listen for sync-requested events (e.g., from service worker)
  useEffect(() => {
    function handleSyncRequested() {
      if (db) {
        triggerSync();
      }
      // If db is not ready, no-op safely
    }

    window.addEventListener("sync-requested", handleSyncRequested);

    return () => {
      window.removeEventListener("sync-requested", handleSyncRequested);
    };
  }, [db, triggerSync]);

  // Full sync (pull + push)
  const triggerSync = useCallback(async () => {
    if (!db || !navigator.onLine) return;

    const previousStatus = state.status;
    setStatus("syncing");

    try {
      // Pull first
      const today = todayInTimeZone();
      const pullResult = await pullChanges(db, today, checkpointRef.current);
      checkpointRef.current = pullResult.checkpoint;

      // Then push
      await pushMutations(db);
      await updatePendingCount();

      setState((prev) => ({
        ...prev,
        status: "online",
        lastSyncAt: new Date(),
        error: null,
      }));
    } catch (error) {
      console.error("[SyncProvider] Sync failed", error);
      setState((prev) => ({
        ...prev,
        status: navigator.onLine ? "error" : "offline",
        error: error instanceof Error ? error.message : "Sync failed",
      }));
    }
  }, [db, state.status, setStatus, updatePendingCount]);

  // Push only (for after local mutations)
  const triggerPush = useCallback(async () => {
    if (!db) return;

    // Update pending count immediately
    await updatePendingCount();

    // Debounce push to batch rapid mutations
    if (pushTimeoutRef.current) {
      clearTimeout(pushTimeoutRef.current);
    }

    pushTimeoutRef.current = setTimeout(async () => {
      if (!navigator.onLine) return;

      try {
        await pushMutations(db);
        await updatePendingCount();
      } catch (error) {
        console.error("[SyncProvider] Push failed", error);
        // Don't update status to error for push failures
        // They'll retry on next sync
      }
    }, PUSH_DEBOUNCE_MS);
  }, [db, updatePendingCount]);

  // Initial sync and periodic sync
  useEffect(() => {
    if (!db) return;

    // Initial sync
    triggerSync();

    // Periodic sync
    syncIntervalRef.current = setInterval(() => {
      if (navigator.onLine && state.status !== "syncing") {
        triggerSync();
      }
    }, SYNC_INTERVAL_MS);

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
      if (pushTimeoutRef.current) {
        clearTimeout(pushTimeoutRef.current);
      }
    };
  }, [db, triggerSync, state.status]);

  // Subscribe to mutation changes to update pending count
  useEffect(() => {
    if (!db) return;

    const subscription = db.mutations
      .find()
      .$.subscribe(() => {
        updatePendingCount();
      });

    return () => {
      subscription.unsubscribe();
    };
  }, [db, updatePendingCount]);

  const value: SyncContextType = {
    db,
    state,
    triggerSync,
    triggerPush,
  };

  return (
    <SyncContext.Provider value={value}>
      {children}
    </SyncContext.Provider>
  );
}

/**
 * Hook to access sync context.
 * Must be used within a SyncProvider.
 */
export function useSyncContext(): SyncContextType {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error("useSyncContext must be used within a SyncProvider");
  }
  return context;
}
