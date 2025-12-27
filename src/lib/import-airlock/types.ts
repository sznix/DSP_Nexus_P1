/**
 * Types for the Import Airlock feature.
 * Handles staging, mapping, diffing, and publishing of daily assignments.
 */

/**
 * Status of an import batch as it moves through the airlock pipeline.
 */
export type ImportBatchStatus =
  | "pending"      // Just created, raw data uploaded
  | "mapped"       // Column mappings confirmed
  | "diffed"       // Diff computed, ready for review
  | "published"    // Published to daily_assignments
  | "cancelled";   // Cancelled by user

/**
 * Normalized field names for column mapping.
 * These are the target fields that incoming columns map to.
 */
export const NORMALIZED_FIELDS = [
  "work_date",
  "driver_name",
  "van_label",
  "vin",
  "route_code",
  "pad",
  "dispatch_time",
  "cart_location",
  "parking_spot_label",
] as const;

export type NormalizedField = (typeof NORMALIZED_FIELDS)[number];

/**
 * Column mapping from source header to normalized field.
 */
export type ColumnMapping = {
  sourceHeader: string;
  targetField: NormalizedField | null;
  ignored: boolean;
};

/**
 * A single row of parsed data before mapping.
 */
export type RawDataRow = Record<string, string>;

/**
 * A staged row after mapping, with normalized field names.
 */
export type StagedRow = {
  rowIndex: number;
  work_date: string | null;
  driver_name: string | null;
  van_label: string | null;
  vin: string | null;
  route_code: string | null;
  pad: string | null;
  dispatch_time: string | null;
  cart_location: string | null;
  parking_spot_label: string | null;
  // Resolution results
  driver_id: string | null;
  driver_resolved: boolean;
  driver_match_type: "exact" | "alias" | "fuzzy" | "new" | null;
  van_id: string | null;
  van_resolved: boolean;
  pad_id: string | null;
  pad_resolved: boolean;
  lot_spot_id: string | null;
  spot_resolved: boolean;
  // Validation
  errors: string[];
  warnings: string[];
};

/**
 * Diff action types.
 */
export type DiffAction = "add" | "update" | "remove" | "unchanged";

/**
 * A single diff row showing before/after for an assignment.
 */
export type DiffRow = {
  action: DiffAction;
  stagedRowIndex: number | null;
  existingAssignmentId: string | null;
  // Before values (from existing assignment)
  before: {
    driver_name: string | null;
    van_label: string | null;
    route_code: string | null;
    pad: string | null;
    dispatch_time: string | null;
    cart_location: string | null;
    parking_spot: string | null;
  } | null;
  // After values (from staged data)
  after: {
    driver_name: string | null;
    van_label: string | null;
    route_code: string | null;
    pad: string | null;
    dispatch_time: string | null;
    cart_location: string | null;
    parking_spot: string | null;
  } | null;
  // Which fields changed
  changedFields: string[];
};

/**
 * Summary of diff results.
 */
export type DiffSummary = {
  added: number;
  updated: number;
  removed: number;
  unchanged: number;
  unresolved: number;
};

/**
 * Full import batch record (matches import_batches table structure).
 */
export type ImportBatch = {
  id: string;
  tenant_id: string;
  work_date: string;
  status: ImportBatchStatus;
  source_type: "upload" | "clipboard" | "manual";
  source_filename: string | null;
  raw_data: RawDataRow[];
  raw_headers: string[];
  column_mappings: ColumnMapping[] | null;
  staged_data: StagedRow[] | null;
  diff_rows: DiffRow[] | null;
  diff_summary: DiffSummary | null;
  created_by: string;
  created_at: string;
  approved_by: string | null;
  approved_at: string | null;
};

/**
 * Request body for creating a new import batch.
 */
export type CreateImportRequest = {
  workDate: string;
  sourceType: "upload" | "clipboard" | "manual";
  sourceFilename?: string;
  rawData: RawDataRow[];
  rawHeaders: string[];
};

/**
 * Request body for mapping columns.
 */
export type MapColumnsRequest = {
  columnMappings: ColumnMapping[];
};

/**
 * Request body for publishing.
 */
export type PublishRequest = {
  // Optional: allow user to confirm unresolved rows should be skipped
  skipUnresolved?: boolean;
};

/**
 * Standard API response envelope.
 */
export type ApiResponse<T = unknown> = {
  ok: boolean;
  data?: T;
  error?: string;
  details?: string;
};

/**
 * Driver resolution suggestion from fuzzy matching.
 */
export type DriverSuggestion = {
  id: string;
  display_name: string;
  confidence: number;
  matchType: "alias" | "fuzzy";
};

/**
 * Unresolved driver info for UI to handle.
 */
export type UnresolvedDriver = {
  stagedRowIndex: number;
  inputName: string;
  suggestions: DriverSuggestion[];
};
