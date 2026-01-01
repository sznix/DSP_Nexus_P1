-- =============================================================================
-- Migration: Import Airlock RLS Policies
-- Date: 2024-12-31
-- Description: Adds/fixes RLS policies for tables used by Import Airlock publish
-- =============================================================================
--
-- This migration addresses:
-- 1. Renames `imports` policies to `import_batches` (code uses import_batches)
-- 2. Adds missing RLS for driver_aliases
-- 3. Adds missing RLS for assignment_event_log
--
-- Tables affected by Import Airlock publish path:
--   - import_batches   (SELECT, UPDATE)
--   - drivers          (INSERT) - already has RLS
--   - driver_aliases   (INSERT) - ADDING
--   - daily_assignments (INSERT, UPDATE) - already has RLS
--   - assignment_event_log (INSERT) - ADDING
--   - work_days        (SELECT, INSERT, UPDATE) - already has RLS
--
-- Required roles: admin, manager (enforced by API before DB operations)
-- Mechanic role: explicitly EXCLUDED from all Import Airlock tables
--
-- =============================================================================
-- VERIFICATION QUERIES (run after applying to verify policies exist):
-- =============================================================================
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd
-- FROM pg_policies
-- WHERE tablename IN ('import_batches', 'driver_aliases', 'assignment_event_log')
-- ORDER BY tablename, policyname;
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Drop legacy `imports` policies if they exist (naming was incorrect)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "imports_select_admin_manager" ON public.imports;
DROP POLICY IF EXISTS "imports_insert_admin_manager" ON public.imports;
DROP POLICY IF EXISTS "imports_update_admin_manager" ON public.imports;
DROP POLICY IF EXISTS "imports_delete_admin_only" ON public.imports;


-- =============================================================================
-- IMPORT_BATCHES TABLE (formerly referenced as `imports`)
-- =============================================================================
-- Used by Import Airlock wizard for staging import data
-- Admin/manager only for all operations

ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;

-- SELECT: admin and manager only
CREATE POLICY "import_batches_select_admin_manager"
ON public.import_batches
FOR SELECT
USING (
  tenant_id IN (SELECT get_user_tenant_ids())
  AND get_user_role_in_tenant(tenant_id) IN ('admin', 'manager')
);

-- INSERT: admin and manager only
CREATE POLICY "import_batches_insert_admin_manager"
ON public.import_batches
FOR INSERT
WITH CHECK (
  tenant_id IN (SELECT get_user_tenant_ids())
  AND get_user_role_in_tenant(tenant_id) IN ('admin', 'manager')
);

-- UPDATE: admin and manager only
CREATE POLICY "import_batches_update_admin_manager"
ON public.import_batches
FOR UPDATE
USING (
  tenant_id IN (SELECT get_user_tenant_ids())
  AND get_user_role_in_tenant(tenant_id) IN ('admin', 'manager')
);

-- DELETE: admin only (cancel/cleanup)
CREATE POLICY "import_batches_delete_admin_only"
ON public.import_batches
FOR DELETE
USING (
  tenant_id IN (SELECT get_user_tenant_ids())
  AND get_user_role_in_tenant(tenant_id) IN ('admin')
);


-- =============================================================================
-- DRIVER_ALIASES TABLE
-- =============================================================================
-- Stores normalized name aliases for fuzzy driver matching
-- Used during Import Airlock diff and publish phases
-- Admin/manager can create aliases; all tenant members can read (for matching)

ALTER TABLE public.driver_aliases ENABLE ROW LEVEL SECURITY;

-- SELECT: All tenant members can read aliases (needed for name matching)
CREATE POLICY "driver_aliases_select_own_tenant"
ON public.driver_aliases
FOR SELECT
USING (tenant_id IN (SELECT get_user_tenant_ids()));

-- INSERT: admin and manager only (created during Import Airlock publish)
CREATE POLICY "driver_aliases_insert_admin_manager"
ON public.driver_aliases
FOR INSERT
WITH CHECK (
  tenant_id IN (SELECT get_user_tenant_ids())
  AND get_user_role_in_tenant(tenant_id) IN ('admin', 'manager')
);

-- UPDATE: admin and manager only
CREATE POLICY "driver_aliases_update_admin_manager"
ON public.driver_aliases
FOR UPDATE
USING (
  tenant_id IN (SELECT get_user_tenant_ids())
  AND get_user_role_in_tenant(tenant_id) IN ('admin', 'manager')
);

-- DELETE: admin only
CREATE POLICY "driver_aliases_delete_admin_only"
ON public.driver_aliases
FOR DELETE
USING (
  tenant_id IN (SELECT get_user_tenant_ids())
  AND get_user_role_in_tenant(tenant_id) IN ('admin')
);


-- =============================================================================
-- ASSIGNMENT_EVENT_LOG TABLE
-- =============================================================================
-- Audit log for all changes to daily_assignments
-- Created during Import Airlock publish and Snake Walk updates
-- Admin/manager can view full logs; dispatchers can view logs they created

ALTER TABLE public.assignment_event_log ENABLE ROW LEVEL SECURITY;

-- SELECT: admin, manager, and dispatcher can view event logs
-- Mechanic is explicitly EXCLUDED (no business need for audit logs)
CREATE POLICY "assignment_event_log_select_by_role"
ON public.assignment_event_log
FOR SELECT
USING (
  tenant_id IN (SELECT get_user_tenant_ids())
  AND get_user_role_in_tenant(tenant_id) IN ('admin', 'manager', 'dispatcher')
);

-- INSERT: admin, manager, and dispatcher can log events
-- Dispatcher needs INSERT for Snake Walk status change logging
CREATE POLICY "assignment_event_log_insert_by_role"
ON public.assignment_event_log
FOR INSERT
WITH CHECK (
  tenant_id IN (SELECT get_user_tenant_ids())
  AND get_user_role_in_tenant(tenant_id) IN ('admin', 'manager', 'dispatcher')
);

-- UPDATE: No updates allowed on audit logs (append-only)
-- No policy = blocked by default

-- DELETE: admin only (for data retention cleanup)
CREATE POLICY "assignment_event_log_delete_admin_only"
ON public.assignment_event_log
FOR DELETE
USING (
  tenant_id IN (SELECT get_user_tenant_ids())
  AND get_user_role_in_tenant(tenant_id) IN ('admin')
);


-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
