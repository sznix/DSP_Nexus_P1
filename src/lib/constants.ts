/**
 * Application constants and configuration.
 */

/**
 * Columns that dispatchers are allowed to PATCH on daily_assignments.
 * Any UPDATE from a dispatcher session attempting to modify columns
 * NOT in this list MUST be rejected with 403.
 *
 * See docs/SECURITY.md for full documentation.
 */
export const DISPATCHER_PATCHABLE_COLUMNS = [
  "card_status",
  "key_status",
  "current_key_holder_id",
  "verification_status",
  "verification_timestamp",
  "verification_user_id",
  "rollout_status",
  "rollout_timestamp",
  "rollout_user_id",
  "cart_location",
  "notes",
] as const;

export type DispatcherPatchableColumn =
  (typeof DISPATCHER_PATCHABLE_COLUMNS)[number];

/**
 * Columns that dispatchers CANNOT modify on daily_assignments.
 * These are set by Import Airlock or are system fields.
 */
export const DISPATCHER_READONLY_COLUMNS = [
  "id",
  "tenant_id",
  "day_date",
  "van_id",
  "driver_id",
  "lot_spot_id",
  "pad",
  "dispatch_time",
  "created_at",
  "updated_at",
] as const;

/**
 * Validate that a PATCH payload only contains allowed columns for dispatcher.
 * Returns true if all columns are allowed, false otherwise.
 */
export function isValidDispatcherPatch(
  payload: Record<string, unknown>
): boolean {
  const allowedSet = new Set<string>(DISPATCHER_PATCHABLE_COLUMNS);
  return Object.keys(payload).every((key) => allowedSet.has(key));
}

/**
 * Get the list of disallowed columns from a PATCH payload.
 * Returns empty array if all columns are allowed.
 */
export function getDisallowedColumns(
  payload: Record<string, unknown>
): string[] {
  const allowedSet = new Set<string>(DISPATCHER_PATCHABLE_COLUMNS);
  return Object.keys(payload).filter((key) => !allowedSet.has(key));
}

/**
 * Role definitions for the application.
 */
export const ROLES = {
  ADMIN: "admin",
  MANAGER: "manager",
  DISPATCHER: "dispatcher",
  MECHANIC: "mechanic",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

/**
 * Roles allowed to access the dispatch/Snake Walk view.
 */
export const DISPATCH_ALLOWED_ROLES: Role[] = ["admin", "manager", "dispatcher"];

/**
 * Roles allowed to INSERT daily_assignments (Import Airlock).
 */
export const DAILY_ASSIGNMENTS_INSERT_ROLES: Role[] = ["admin", "manager"];

/**
 * Roles allowed to UPDATE daily_assignments.
 * Note: Dispatcher can only UPDATE whitelisted columns.
 */
export const DAILY_ASSIGNMENTS_UPDATE_ROLES: Role[] = [
  "admin",
  "manager",
  "dispatcher",
];

/**
 * Roles allowed to DELETE daily_assignments.
 */
export const DAILY_ASSIGNMENTS_DELETE_ROLES: Role[] = ["admin"];
