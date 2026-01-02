/**
 * Offline sync module - re-exports.
 */

// Types
export type {
  AssignmentDoc,
  MutationDoc,
  SyncStatus,
  SyncState,
  PullRequest,
  PullResponse,
  PushRequest,
  PushResponse,
  PushMutation,
  PushMutationResult,
} from "./types";

// Database
export {
  getDatabase,
  closeDatabase,
  generateId,
  type SyncDatabase,
  type SyncCollections,
} from "./database";

// Sync engine
export {
  pullChanges,
  pushMutations,
  queueMutation,
  getPendingCount,
  clearFailedMutations,
} from "./sync-engine";

// Mutations
export {
  applyLocalMutation,
  toggleKeyStatus,
  cycleCardStatus,
  toggleVerificationStatus,
  transferKeysToDriver,
  returnKeysToStation,
} from "./mutations";
