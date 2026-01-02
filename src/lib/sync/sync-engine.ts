/**
 * Sync engine for pull/push operations.
 */

import type { SyncDatabase } from "./database";
import type {
  AssignmentDoc,
  PullRequest,
  PullResponse,
  PushRequest,
  PushResponse,
  PushMutation,
} from "./types";

const PULL_ENDPOINT = "/api/sync/pull";
const PUSH_ENDPOINT = "/api/sync/push";
const DEFAULT_LIMIT = 100;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

/**
 * Pull changes from server for a specific date.
 * Fetches all changes since the last checkpoint.
 */
export async function pullChanges(
  db: SyncDatabase,
  date: string,
  checkpoint?: string
): Promise<{ synced: number; checkpoint: string }> {
  let currentCheckpoint = checkpoint;
  let totalSynced = 0;
  let hasMore = true;

  while (hasMore) {
    const request: PullRequest = {
      date,
      checkpoint: currentCheckpoint,
      limit: DEFAULT_LIMIT,
    };

    const response = await fetch(PULL_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(`Pull failed: ${response.status} - ${errorText}`);
    }

    const data: PullResponse = await response.json();

    // Upsert assignments into local database
    for (const assignment of data.assignments) {
      await upsertAssignment(db, assignment);
    }

    totalSynced += data.assignments.length;
    currentCheckpoint = data.checkpoint;
    hasMore = data.hasMore;
  }

  return {
    synced: totalSynced,
    checkpoint: currentCheckpoint ?? new Date().toISOString(),
  };
}

/**
 * Upsert an assignment into the local database.
 * Only updates if server version is newer than local.
 */
async function upsertAssignment(
  db: SyncDatabase,
  serverDoc: AssignmentDoc
): Promise<void> {
  const existing = await db.assignments.findOne(serverDoc.id).exec();

  if (!existing) {
    // Insert new document
    await db.assignments.insert({
      ...serverDoc,
      _local_updated_at: 0,
      _pending_sync: false,
    });
    return;
  }

  // Check if local has pending changes
  if (existing._pending_sync) {
    // Merge: keep local changes, update server-controlled fields
    // For v0, we'll let push handle conflicts
    return;
  }

  // No local changes, update from server
  await existing.patch({
    ...serverDoc,
    _local_updated_at: existing._local_updated_at,
    _pending_sync: false,
  });
}

/**
 * Push pending mutations to server.
 * Processes mutations in order, handles conflicts.
 */
export async function pushMutations(
  db: SyncDatabase
): Promise<{ pushed: number; failed: number }> {
  // Get all pending mutations, ordered by creation time
  const pendingMutations = await db.mutations
    .find({
      selector: { status: "pending" },
      sort: [{ created_at: "asc" }],
    })
    .exec();

  if (pendingMutations.length === 0) {
    return { pushed: 0, failed: 0 };
  }

  // Mark as in-flight
  for (const mutation of pendingMutations) {
    await mutation.patch({ status: "in_flight" });
  }

  // Build push request
  const mutations: PushMutation[] = pendingMutations.map((m) => ({
    id: m.id,
    assignment_id: m.assignment_id,
    patch: m.patch,
    timestamp: m.created_at,
  }));

  const request: PushRequest = { mutations };

  try {
    const response = await fetch(PUSH_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      // Network or auth error, revert to pending for retry
      for (const mutation of pendingMutations) {
        await mutation.patch({
          status: "pending",
          retry_count: mutation.retry_count + 1,
        });
      }
      throw new Error(`Push failed: ${response.status}`);
    }

    const data: PushResponse = await response.json();

    let pushed = 0;
    let failed = 0;

    // Process results
    for (const result of data.results) {
      const mutation = pendingMutations.find((m) => m.id === result.mutation_id);
      if (!mutation) continue;

      if (result.status === "accepted") {
        // Remove from queue and clear pending flag on assignment
        await mutation.remove();
        const assignment = await db.assignments.findOne(mutation.assignment_id).exec();
        if (assignment) {
          await assignment.patch({ _pending_sync: false });
        }
        pushed++;
      } else if (result.status === "conflict") {
        // Update local with server state, remove mutation
        if (result.server_doc) {
          await upsertAssignment(db, result.server_doc);
        }
        await mutation.remove();
        failed++;
      } else {
        // Rejected - mark as failed
        await mutation.patch({
          status: "failed",
          error: result.error ?? "Unknown error",
          retry_count: mutation.retry_count + 1,
        });
        failed++;
      }
    }

    return { pushed, failed };
  } catch (error) {
    // Revert to pending on network error
    for (const mutation of pendingMutations) {
      if (mutation.retry_count < MAX_RETRIES) {
        await mutation.patch({
          status: "pending",
          retry_count: mutation.retry_count + 1,
        });
      } else {
        await mutation.patch({
          status: "failed",
          error: error instanceof Error ? error.message : "Max retries exceeded",
        });
      }
    }
    throw error;
  }
}

/**
 * Queue a mutation for later sync.
 */
export async function queueMutation(
  db: SyncDatabase,
  assignmentId: string,
  patch: Record<string, unknown>
): Promise<string> {
  const id = crypto.randomUUID();

  await db.mutations.insert({
    id,
    assignment_id: assignmentId,
    patch,
    created_at: Date.now(),
    status: "pending",
    error: null,
    retry_count: 0,
  });

  return id;
}

/**
 * Get count of pending mutations.
 */
export async function getPendingCount(db: SyncDatabase): Promise<number> {
  const pending = await db.mutations
    .find({
      selector: { status: { $in: ["pending", "in_flight"] } },
    })
    .exec();

  return pending.length;
}

/**
 * Clear failed mutations (for retry all).
 */
export async function clearFailedMutations(db: SyncDatabase): Promise<number> {
  const failed = await db.mutations
    .find({ selector: { status: "failed" } })
    .exec();

  for (const mutation of failed) {
    await mutation.patch({ status: "pending", retry_count: 0, error: null });
  }

  return failed.length;
}
