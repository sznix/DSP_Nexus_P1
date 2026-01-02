/**
 * Type definitions for offline sync module.
 */

import type {
  CardStatus,
  KeyStatus,
  VerificationStatus,
} from "@/lib/constants";

/**
 * Assignment document stored in RxDB.
 * Denormalized from daily_assignments with joined data.
 */
export type AssignmentDoc = {
  id: string;
  tenant_id: string;
  day_date: string; // YYYY-MM-DD

  // Display fields (read-only from server)
  pad: string | null;
  dispatch_time: string | null;
  cart_location: string | null;
  notes: string | null;

  // Denormalized joined data
  van_label: string | null;
  driver_id: string | null;
  driver_name: string | null;
  spot_id: string | null;
  spot_label: string | null;
  spot_sort_index: number;
  zone_id: string | null;
  zone_name: string | null;
  zone_sort_order: number;

  // Mutable checkoff fields (dispatcher can patch)
  key_status: KeyStatus | null;
  card_status: CardStatus | null;
  current_key_holder_id: string | null;
  verification_status: VerificationStatus | null;
  rollout_status: string | null;

  // Sync metadata
  updated_at: string; // Server timestamp (ISO)
  _local_updated_at: number; // Local mutation timestamp (epoch ms)
  _pending_sync: boolean; // True if local changes not pushed
  _deleted: boolean; // Soft delete flag
};

/**
 * Mutation document stored in outbox queue.
 */
export type MutationDoc = {
  id: string;
  assignment_id: string;
  patch: Record<string, unknown>;
  created_at: number; // Epoch ms
  status: "pending" | "in_flight" | "failed";
  error: string | null;
  retry_count: number;
};

/**
 * Sync status for UI display.
 */
export type SyncStatus = "online" | "offline" | "syncing" | "error";

/**
 * Sync state exposed by SyncProvider.
 */
export type SyncState = {
  status: SyncStatus;
  pendingCount: number;
  lastSyncAt: Date | null;
  error: string | null;
};

/**
 * Pull request payload.
 */
export type PullRequest = {
  date: string;
  checkpoint?: string;
  limit?: number;
};

/**
 * Pull response from server.
 */
export type PullResponse = {
  assignments: AssignmentDoc[];
  checkpoint: string;
  hasMore: boolean;
};

/**
 * Single mutation in push request.
 */
export type PushMutation = {
  id: string;
  assignment_id: string;
  patch: Record<string, unknown>;
  timestamp: number;
};

/**
 * Push request payload.
 */
export type PushRequest = {
  mutations: PushMutation[];
};

/**
 * Result for a single mutation in push response.
 */
export type PushMutationResult = {
  mutation_id: string;
  status: "accepted" | "rejected" | "conflict";
  error?: string;
  server_doc?: AssignmentDoc;
};

/**
 * Push response from server.
 */
export type PushResponse = {
  results: PushMutationResult[];
};
