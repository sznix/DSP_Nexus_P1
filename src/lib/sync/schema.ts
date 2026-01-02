/**
 * RxDB collection schemas for offline sync.
 */

import type { RxJsonSchema } from "rxdb";
import type { AssignmentDoc, MutationDoc } from "./types";

/**
 * Schema for assignments collection.
 * Stores denormalized daily_assignments with joined data.
 */
export const assignmentSchema: RxJsonSchema<AssignmentDoc> = {
  version: 0,
  primaryKey: "id",
  type: "object",
  properties: {
    id: { type: "string", maxLength: 36 },
    tenant_id: { type: "string", maxLength: 36 },
    day_date: { type: "string", maxLength: 10 },

    pad: { type: ["string", "null"] },
    dispatch_time: { type: ["string", "null"] },
    cart_location: { type: ["string", "null"] },
    notes: { type: ["string", "null"] },

    van_label: { type: ["string", "null"] },
    driver_id: { type: ["string", "null"] },
    driver_name: { type: ["string", "null"] },
    spot_id: { type: ["string", "null"] },
    spot_label: { type: ["string", "null"] },
    spot_sort_index: { type: "number" },
    zone_id: { type: ["string", "null"] },
    zone_name: { type: ["string", "null"] },
    zone_sort_order: { type: "number" },

    key_status: { type: ["string", "null"] },
    card_status: { type: ["string", "null"] },
    current_key_holder_id: { type: ["string", "null"] },
    verification_status: { type: ["string", "null"] },
    rollout_status: { type: ["string", "null"] },

    updated_at: { type: "string" },
    _local_updated_at: { type: "number" },
    _pending_sync: { type: "boolean" },
    _deleted: { type: "boolean" },
  },
  required: ["id", "tenant_id", "day_date", "updated_at"],
  indexes: ["day_date", "tenant_id", "updated_at", "_pending_sync"],
};

/**
 * Schema for mutations outbox queue.
 * Stores pending PATCH operations to push to server.
 */
export const mutationSchema: RxJsonSchema<MutationDoc> = {
  version: 0,
  primaryKey: "id",
  type: "object",
  properties: {
    id: { type: "string", maxLength: 36 },
    assignment_id: { type: "string", maxLength: 36 },
    patch: { type: "object" },
    created_at: { type: "number" },
    status: { type: "string" },
    error: { type: ["string", "null"] },
    retry_count: { type: "number" },
  },
  required: ["id", "assignment_id", "patch", "created_at", "status"],
  indexes: ["status", "created_at"],
};
