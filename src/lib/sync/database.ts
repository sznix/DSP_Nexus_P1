/**
 * RxDB database initialization for offline sync.
 */

import { createRxDatabase, RxDatabase, RxCollection } from "rxdb";
import { getRxStorageDexie } from "rxdb/plugins/storage-dexie";
import { assignmentSchema, mutationSchema } from "./schema";
import type { AssignmentDoc, MutationDoc } from "./types";

/**
 * Collection types for the sync database.
 */
export type SyncCollections = {
  assignments: RxCollection<AssignmentDoc>;
  mutations: RxCollection<MutationDoc>;
};

export type SyncDatabase = RxDatabase<SyncCollections>;

let dbPromise: Promise<SyncDatabase> | null = null;

/**
 * Get or create the RxDB database instance.
 * Uses Dexie (IndexedDB) as the storage backend.
 *
 * @param tenantId - Tenant ID for database namespacing
 */
export async function getDatabase(tenantId: string): Promise<SyncDatabase> {
  if (typeof window === "undefined") {
    throw new Error("RxDB can only be used in browser environment");
  }

  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = createDatabase(tenantId);
  return dbPromise;
}

async function createDatabase(tenantId: string): Promise<SyncDatabase> {
  // Database name includes tenant for isolation
  const dbName = `dsp_nexus_${tenantId.replace(/-/g, "_")}`;

  const db = await createRxDatabase<SyncCollections>({
    name: dbName,
    storage: getRxStorageDexie(),
    ignoreDuplicate: true, // Allow reconnection in dev
  });

  // Add collections
  await db.addCollections({
    assignments: {
      schema: assignmentSchema,
    },
    mutations: {
      schema: mutationSchema,
    },
  });

  return db;
}

/**
 * Close the database connection and clear the cached instance.
 */
export async function closeDatabase(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise;
    await db.close();
    dbPromise = null;
  }
}

/**
 * Generate a UUID v4 for mutation IDs.
 */
export function generateId(): string {
  return crypto.randomUUID();
}
