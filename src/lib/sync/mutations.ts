/**
 * Mutation utilities for offline-first updates.
 */

import type { SyncDatabase } from "./database";
import type { AssignmentDoc } from "./types";
import { queueMutation } from "./sync-engine";
import { DISPATCHER_PATCHABLE_COLUMNS } from "@/lib/constants";

/**
 * Apply a local mutation to an assignment.
 * Updates local state immediately and queues for sync.
 *
 * @param db - RxDB database instance
 * @param assignmentId - ID of the assignment to update
 * @param patch - Fields to update (must be in dispatcher whitelist)
 * @returns The updated assignment document
 */
export async function applyLocalMutation(
  db: SyncDatabase,
  assignmentId: string,
  patch: Record<string, unknown>
): Promise<AssignmentDoc | null> {
  // Validate patch against whitelist
  const allowedSet = new Set<string>(DISPATCHER_PATCHABLE_COLUMNS);
  const invalidKeys = Object.keys(patch).filter((key) => !allowedSet.has(key));

  if (invalidKeys.length > 0) {
    throw new Error(`Invalid patch keys: ${invalidKeys.join(", ")}`);
  }

  // Find the assignment
  const assignment = await db.assignments.findOne(assignmentId).exec();

  if (!assignment) {
    throw new Error(`Assignment not found: ${assignmentId}`);
  }

  // Apply optimistic update
  const now = Date.now();
  await assignment.patch({
    ...patch,
    _local_updated_at: now,
    _pending_sync: true,
  });

  // Queue mutation for sync
  await queueMutation(db, assignmentId, patch);

  // Return updated document
  return assignment.toJSON() as AssignmentDoc;
}

/**
 * Toggle key status between STATION and WITH_DRIVER.
 */
export async function toggleKeyStatus(
  db: SyncDatabase,
  assignmentId: string,
  currentStatus: string | null,
  driverId: string | null
): Promise<AssignmentDoc | null> {
  const newStatus = currentStatus === "WITH_DRIVER" ? "STATION" : "WITH_DRIVER";

  const patch: Record<string, unknown> = {
    key_status: newStatus,
  };

  // If giving keys to driver, set current holder
  if (newStatus === "WITH_DRIVER" && driverId) {
    patch.current_key_holder_id = driverId;
  }

  // If returning keys to station, clear holder
  if (newStatus === "STATION") {
    patch.current_key_holder_id = null;
  }

  return applyLocalMutation(db, assignmentId, patch);
}

/**
 * Cycle card status: not_given -> given -> skipped -> not_given
 */
export async function cycleCardStatus(
  db: SyncDatabase,
  assignmentId: string,
  currentStatus: string | null
): Promise<AssignmentDoc | null> {
  let newStatus: string;

  switch (currentStatus) {
    case "given":
      newStatus = "skipped";
      break;
    case "skipped":
      newStatus = "not_given";
      break;
    case "not_given":
    default:
      newStatus = "given";
      break;
  }

  return applyLocalMutation(db, assignmentId, { card_status: newStatus });
}

/**
 * Toggle verification status between pending and verified.
 */
export async function toggleVerificationStatus(
  db: SyncDatabase,
  assignmentId: string,
  currentStatus: string | null
): Promise<AssignmentDoc | null> {
  const newStatus = currentStatus === "verified" ? "pending" : "verified";

  const patch: Record<string, unknown> = {
    verification_status: newStatus,
  };

  // Server will stamp verification_timestamp and verification_user_id
  // We include them here for optimistic UI, server will override
  if (newStatus === "verified") {
    patch.verification_timestamp = new Date().toISOString();
  }

  return applyLocalMutation(db, assignmentId, patch);
}

/**
 * Transfer keys to assigned driver (resolves retrieval barrier).
 */
export async function transferKeysToDriver(
  db: SyncDatabase,
  assignmentId: string,
  driverId: string
): Promise<AssignmentDoc | null> {
  return applyLocalMutation(db, assignmentId, {
    key_status: "WITH_DRIVER",
    current_key_holder_id: driverId,
  });
}

/**
 * Return keys to station.
 */
export async function returnKeysToStation(
  db: SyncDatabase,
  assignmentId: string
): Promise<AssignmentDoc | null> {
  return applyLocalMutation(db, assignmentId, {
    key_status: "STATION",
    current_key_holder_id: null,
  });
}
