# Import Airlock Flow

> **If this documentation disagrees with code, the code wins.**
> This document describes the Import Airlock data ingestion pipeline for admins/managers.

## Overview

Multi-step import wizard for ingesting daily assignment data from CSV/Excel files, clipboard paste, or manual entry. Data flows through staging with name resolution before publishing to `daily_assignments`.

## Flow Summary

```
Source (upload/paste/manual)
         │
         ▼
   ┌─────────────┐
   │   Parse     │ ← CSV/XLSX parsing, header extraction
   └─────────────┘
         │
         ▼
   ┌─────────────┐
   │   Create    │ ← POST /api/import-airlock/create
   │   Batch     │ → stores raw_data in import_batches
   └─────────────┘
         │
         ▼
   ┌─────────────┐
   │   Column    │ ← POST /api/import-airlock/:id/map
   │   Mapping   │ → sourceHeader → normalized field
   └─────────────┘
         │
         ▼
   ┌─────────────┐
   │   Diff      │ ← POST /api/import-airlock/:id/diff
   │   Preview   │ → resolves drivers/vans, computes changes
   └─────────────┘
         │
         ▼
   ┌─────────────┐
   │   Publish   │ ← POST /api/import-airlock/:id/publish
   │   Snapshot  │ → writes to daily_assignments
   └─────────────┘
```

## Wizard Steps

### Step 1: Source Selection

Three input modes:
- **File Upload** - CSV, XLSX, XLS files
- **Clipboard Paste** - Tab or comma-delimited text
- **Manual Entry** - Direct row-by-row input form

Client-side parsing via PapaParse (CSV) and SheetJS (Excel).

### Step 2: Column Mapping

Map source columns to normalized fields:
- `work_date` - Work date (usually from filename or date picker)
- `driver_name` - Driver display name (fuzzy matched)
- `van_label` - Van identifier
- `vin` - Vehicle VIN
- `route_code` - Route/cycle code
- `pad` - Loading pad
- `dispatch_time` - Dispatch time
- `cart_location` - Cart/tote location
- `parking_spot_label` - Parking spot identifier

Auto-mapping attempts to match based on common header patterns.

### Step 3: Diff Preview

Shows before/after comparison:
- **Added** - New assignments to create
- **Updated** - Existing assignments with changes
- **Removed** - Assignments no longer in import (cleared, not deleted)
- **Unchanged** - No modifications needed
- **Unresolved** - Rows with driver/van matching issues

Name resolution uses:
- Exact match on `drivers.display_name`
- Fuzzy match via `driver_aliases.normalized_alias`
- Jaccard similarity + Levenshtein distance scoring

### Step 4: Publish

On publish:
1. Creates new drivers for unresolved names (with aliases)
2. Inserts new `daily_assignments` rows
3. Updates existing rows (only changed fields)
4. Clears removed assignments (nullifies identity fields, no hard delete)
5. Logs all changes to `assignment_event_log`
6. Updates `work_days.snapshot_version` and `content_hash`

## Sequence Diagram

```mermaid
sequenceDiagram
    participant Admin
    participant Wizard as Import Wizard
    participant API as /api/import-airlock/*
    participant DB as Supabase

    Admin->>Wizard: Upload CSV or enter data
    Wizard->>Wizard: Parse file (client-side)
    Wizard->>API: POST /create
    API->>DB: INSERT import_batches (pending)
    API-->>Wizard: batch.id

    Admin->>Wizard: Map columns
    Wizard->>API: POST /:id/map
    API->>DB: UPDATE import_batches (mapped)

    Wizard->>API: POST /:id/diff
    API->>DB: Query existing daily_assignments
    API->>DB: Query drivers, vans, spots
    API->>API: Resolve names, compute diff
    API->>DB: UPDATE import_batches (diffed)
    API-->>Wizard: diffRows, summary

    Admin->>Wizard: Review & Publish
    Wizard->>API: POST /:id/publish
    API->>DB: INSERT drivers (new)
    API->>DB: INSERT driver_aliases
    API->>DB: INSERT/UPDATE daily_assignments
    API->>DB: INSERT assignment_event_log
    API->>DB: UPSERT work_days
    API->>DB: UPDATE import_batches (published)
    API-->>Wizard: results summary
```

## Security

### Authorization
- All endpoints require `admin` or `manager` role
- Uses `requireRole(["admin", "manager"])` from `@/lib/auth`
- Returns 401 (unauthenticated) or 403 (unauthorized) on failure

### RLS Policies

All policies use allow-list pattern (explicit role grants, no exclusions).

| Table                    | SELECT                     | INSERT                     | UPDATE                     | DELETE |
| ------------------------ | -------------------------- | -------------------------- | -------------------------- | ------ |
| `import_batches`         | admin, manager             | admin, manager             | admin, manager             | admin  |
| `daily_assignments`      | admin, manager, dispatcher | admin, manager             | admin, manager, dispatcher | admin  |
| `drivers`                | all tenant members         | admin, manager             | admin, manager             | admin  |
| `driver_aliases`         | all tenant members         | admin, manager             | admin, manager             | admin  |
| `assignment_event_log`   | admin, manager, dispatcher | admin, manager, dispatcher | (blocked)                  | admin  |
| `work_days`              | all tenant members         | admin, manager             | admin, manager             | admin  |

**Role Exclusions:**

- `mechanic` - Cannot access `import_batches`, `daily_assignments`, or `assignment_event_log`
- `dispatcher` - Cannot INSERT into `import_batches` (read-only for wizard)

**Migration:** See [`supabase/migrations/20241231_001_import_airlock_rls.sql`](../../supabase/migrations/20241231_001_import_airlock_rls.sql)

### Batch Isolation
- Each batch scoped to `tenant_id`
- Only one in-progress batch per (tenant, work_date) allowed
- Conflict returns 409 with existing batch ID

### Verification Query

Run after applying RLS migration to verify policies exist:

```sql
SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE tablename IN ('import_batches', 'driver_aliases', 'assignment_event_log')
ORDER BY tablename, policyname;
```

## Batch Status Lifecycle

```
pending → mapped → diffed → published
                     ↓
                 cancelled
```

## API Reference

### POST /api/import-airlock/create

Creates a new import batch.

**Request:**
```json
{
  "workDate": "2024-01-15",
  "sourceType": "upload" | "clipboard" | "manual",
  "sourceFilename": "dispatch.xlsx",
  "rawData": [{ "Driver": "John Doe", "Van": "VAN-001" }],
  "rawHeaders": ["Driver", "Van", "Route"]
}
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "id": "uuid",
    "status": "pending",
    "workDate": "2024-01-15",
    "rowCount": 25
  }
}
```

### POST /api/import-airlock/:id/map

Applies column mappings.

**Request:**
```json
{
  "columnMappings": [
    { "sourceHeader": "Driver", "targetField": "driver_name", "ignored": false }
  ]
}
```

### POST /api/import-airlock/:id/diff

Computes diff against existing assignments.

**Response includes:**
- `diffRows` - Array of DiffRow objects
- `summary` - Counts: added, updated, removed, unchanged, unresolved

### POST /api/import-airlock/:id/publish

Publishes changes to production tables.

**Request:**
```json
{
  "skipUnresolved": true
}
```

**Response includes:**
- `created`, `updated`, `cleared`, `skipped` counts
- `driversCreated`, `aliasesCreated` counts
- `errors` - Any row-level errors

## Code References

| Component | File |
|-----------|------|
| Wizard UI | [`src/app/app/admin/import-airlock/wizard.tsx`](../../src/app/app/admin/import-airlock/wizard.tsx) |
| Types | [`src/lib/import-airlock/types.ts`](../../src/lib/import-airlock/types.ts) |
| Parsers | [`src/lib/import-airlock/parsers.ts`](../../src/lib/import-airlock/parsers.ts) |
| Name Resolution | [`src/lib/import-airlock/name-resolution.ts`](../../src/lib/import-airlock/name-resolution.ts) |
| Create API | [`src/app/api/import-airlock/create/route.ts`](../../src/app/api/import-airlock/create/route.ts) |
| Map API | [`src/app/api/import-airlock/[id]/map/route.ts`](../../src/app/api/import-airlock/[id]/map/route.ts) |
| Diff API | [`src/app/api/import-airlock/[id]/diff/route.ts`](../../src/app/api/import-airlock/[id]/diff/route.ts) |
| Publish API | [`src/app/api/import-airlock/[id]/publish/route.ts`](../../src/app/api/import-airlock/[id]/publish/route.ts) |
| RLS Policies | [`supabase/rls_role_policies.sql`](../../supabase/rls_role_policies.sql) |
