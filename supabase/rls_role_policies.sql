-- =============================================================================
-- DSP Nexus - Row Level Security (RLS) Policies
-- =============================================================================
--
-- IMPORTANT: This file contains EXAMPLE policies. Review and adapt to your
-- specific schema before applying to production.
--
-- These policies enforce:
-- 1. Tenant isolation - users can only access data from their own tenant
-- 2. Role-based access - certain operations restricted by user role
--
-- Prerequisites:
-- - Supabase Auth configured
-- - tenant_members table with user_id, tenant_id, and role columns
-- =============================================================================

-- =============================================================================
-- TENANT_MEMBERS TABLE
-- =============================================================================
-- Users can only see members of their own tenant

ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;

-- SELECT: Users can see all members in their tenant
CREATE POLICY "tenant_members_select_own_tenant"
ON public.tenant_members
FOR SELECT
USING (tenant_id IN (SELECT get_user_tenant_ids()));

-- INSERT: Only admin can add new members
CREATE POLICY "tenant_members_insert_admin_only"
ON public.tenant_members
FOR INSERT
WITH CHECK (
  tenant_id IN (SELECT get_user_tenant_ids())
  AND get_user_role_in_tenant(tenant_id) IN ('admin')
);

-- UPDATE: Only admin can update members
CREATE POLICY "tenant_members_update_admin_only"
ON public.tenant_members
FOR UPDATE
USING (
  tenant_id IN (SELECT get_user_tenant_ids())
  AND get_user_role_in_tenant(tenant_id) IN ('admin')
);

-- DELETE: Only admin can remove members
CREATE POLICY "tenant_members_delete_admin_only"
ON public.tenant_members
FOR DELETE
USING (
  tenant_id IN (SELECT get_user_tenant_ids())
  AND get_user_role_in_tenant(tenant_id) IN ('admin')
);


-- =============================================================================
-- DAILY_ASSIGNMENTS TABLE
-- =============================================================================
-- Core dispatch data - role-based access
--
-- IMPORTANT ACCESS RULES:
-- - SELECT: admin, manager, dispatcher ONLY (mechanic CANNOT query this table)
-- - INSERT: admin, manager ONLY (created via Import Airlock, NEVER from Snake Walk)
-- - UPDATE: admin, manager, dispatcher (Snake Walk uses PATCH to update existing rows)
-- - DELETE: admin ONLY
--
-- Snake Walk (dispatch view) must only PATCH existing rows, never INSERT new ones.
-- Mechanic role is intentionally blocked from SELECT - they have no business need
-- to see daily assignments.

ALTER TABLE public.daily_assignments ENABLE ROW LEVEL SECURITY;

-- SELECT: admin, manager, dispatcher can view assignments
-- NOTE: mechanic is intentionally EXCLUDED - they cannot query this table
CREATE POLICY "daily_assignments_select_by_role"
ON public.daily_assignments
FOR SELECT
USING (
  tenant_id IN (SELECT get_user_tenant_ids())
  AND get_user_role_in_tenant(tenant_id) IN ('admin', 'manager', 'dispatcher')
);

-- INSERT: Only admin and manager can create assignments
-- NOTE: Assignments are created via Import Airlock, NEVER from Snake Walk UI
CREATE POLICY "daily_assignments_insert_admin_manager"
ON public.daily_assignments
FOR INSERT
WITH CHECK (
  tenant_id IN (SELECT get_user_tenant_ids())
  AND get_user_role_in_tenant(tenant_id) IN ('admin', 'manager')
);

-- UPDATE: admin, manager, AND dispatcher can update assignments
-- NOTE: Dispatcher needs UPDATE for Snake Walk to PATCH verification_status, key_status, etc.
-- Dispatcher has UPDATE but NOT INSERT - they can only modify existing rows
CREATE POLICY "daily_assignments_update_by_role"
ON public.daily_assignments
FOR UPDATE
USING (
  tenant_id IN (SELECT get_user_tenant_ids())
  AND get_user_role_in_tenant(tenant_id) IN ('admin', 'manager', 'dispatcher')
);

-- DELETE: Only admin can delete assignments
CREATE POLICY "daily_assignments_delete_admin_only"
ON public.daily_assignments
FOR DELETE
USING (
  tenant_id IN (SELECT get_user_tenant_ids())
  AND get_user_role_in_tenant(tenant_id) IN ('admin')
);


-- =============================================================================
-- IMPORT_BATCHES TABLE (Import Airlock feature)
-- =============================================================================
-- Admin/manager only for all operations
-- Note: Table was previously referenced as `imports` in some docs

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

-- DELETE: admin only
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

ALTER TABLE public.driver_aliases ENABLE ROW LEVEL SECURITY;

-- SELECT: All tenant members can read aliases (needed for name matching)
CREATE POLICY "driver_aliases_select_own_tenant"
ON public.driver_aliases
FOR SELECT
USING (tenant_id IN (SELECT get_user_tenant_ids()));

-- INSERT: admin and manager only
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
-- Mechanic is explicitly EXCLUDED (no business need for audit logs)

ALTER TABLE public.assignment_event_log ENABLE ROW LEVEL SECURITY;

-- SELECT: admin, manager, and dispatcher can view event logs
CREATE POLICY "assignment_event_log_select_by_role"
ON public.assignment_event_log
FOR SELECT
USING (
  tenant_id IN (SELECT get_user_tenant_ids())
  AND get_user_role_in_tenant(tenant_id) IN ('admin', 'manager', 'dispatcher')
);

-- INSERT: admin, manager, and dispatcher can log events
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
-- VAN_REPORTS TABLE (Mechanic feature)
-- =============================================================================
-- Mechanics can view, dispatchers/managers can create

ALTER TABLE public.van_reports ENABLE ROW LEVEL SECURITY;

-- SELECT: admin, manager, mechanic can view reports
CREATE POLICY "van_reports_select_by_role"
ON public.van_reports
FOR SELECT
USING (
  tenant_id IN (SELECT get_user_tenant_ids())
  AND get_user_role_in_tenant(tenant_id) IN ('admin', 'manager', 'mechanic')
);

-- INSERT: admin, manager, dispatcher can create reports
CREATE POLICY "van_reports_insert_by_role"
ON public.van_reports
FOR INSERT
WITH CHECK (
  tenant_id IN (SELECT get_user_tenant_ids())
  AND get_user_role_in_tenant(tenant_id) IN ('admin', 'manager', 'dispatcher')
);

-- UPDATE: admin and manager only
CREATE POLICY "van_reports_update_admin_manager"
ON public.van_reports
FOR UPDATE
USING (
  tenant_id IN (SELECT get_user_tenant_ids())
  AND get_user_role_in_tenant(tenant_id) IN ('admin', 'manager')
);

-- DELETE: admin only
CREATE POLICY "van_reports_delete_admin_only"
ON public.van_reports
FOR DELETE
USING (
  tenant_id IN (SELECT get_user_tenant_ids())
  AND get_user_role_in_tenant(tenant_id) IN ('admin')
);


-- =============================================================================
-- VANS TABLE
-- =============================================================================
-- Fleet vehicle data - all authenticated users can view, admin/manager can modify

ALTER TABLE public.vans ENABLE ROW LEVEL SECURITY;

-- SELECT: All tenant members can view vans
CREATE POLICY "vans_select_own_tenant"
ON public.vans
FOR SELECT
USING (tenant_id IN (SELECT get_user_tenant_ids()));

-- INSERT: admin and manager only
CREATE POLICY "vans_insert_admin_manager"
ON public.vans
FOR INSERT
WITH CHECK (
  tenant_id IN (SELECT get_user_tenant_ids())
  AND get_user_role_in_tenant(tenant_id) IN ('admin', 'manager')
);

-- UPDATE: admin and manager only
CREATE POLICY "vans_update_admin_manager"
ON public.vans
FOR UPDATE
USING (
  tenant_id IN (SELECT get_user_tenant_ids())
  AND get_user_role_in_tenant(tenant_id) IN ('admin', 'manager')
);

-- DELETE: admin only
CREATE POLICY "vans_delete_admin_only"
ON public.vans
FOR DELETE
USING (
  tenant_id IN (SELECT get_user_tenant_ids())
  AND get_user_role_in_tenant(tenant_id) IN ('admin')
);


-- =============================================================================
-- DRIVERS TABLE
-- =============================================================================
-- Similar pattern to vans

ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;

-- SELECT: All tenant members can view drivers
CREATE POLICY "drivers_select_own_tenant"
ON public.drivers
FOR SELECT
USING (tenant_id IN (SELECT get_user_tenant_ids()));

-- INSERT: admin and manager only
CREATE POLICY "drivers_insert_admin_manager"
ON public.drivers
FOR INSERT
WITH CHECK (
  tenant_id IN (SELECT get_user_tenant_ids())
  AND get_user_role_in_tenant(tenant_id) IN ('admin', 'manager')
);

-- UPDATE: admin and manager only
CREATE POLICY "drivers_update_admin_manager"
ON public.drivers
FOR UPDATE
USING (
  tenant_id IN (SELECT get_user_tenant_ids())
  AND get_user_role_in_tenant(tenant_id) IN ('admin', 'manager')
);

-- DELETE: admin only
CREATE POLICY "drivers_delete_admin_only"
ON public.drivers
FOR DELETE
USING (
  tenant_id IN (SELECT get_user_tenant_ids())
  AND get_user_role_in_tenant(tenant_id) IN ('admin')
);


-- =============================================================================
-- LOT_ZONES TABLE
-- =============================================================================

ALTER TABLE public.lot_zones ENABLE ROW LEVEL SECURITY;

-- SELECT: All tenant members can view zones
CREATE POLICY "lot_zones_select_own_tenant"
ON public.lot_zones
FOR SELECT
USING (tenant_id IN (SELECT get_user_tenant_ids()));

-- INSERT: admin and manager only
CREATE POLICY "lot_zones_insert_admin_manager"
ON public.lot_zones
FOR INSERT
WITH CHECK (
  tenant_id IN (SELECT get_user_tenant_ids())
  AND get_user_role_in_tenant(tenant_id) IN ('admin', 'manager')
);

-- UPDATE: admin and manager only
CREATE POLICY "lot_zones_update_admin_manager"
ON public.lot_zones
FOR UPDATE
USING (
  tenant_id IN (SELECT get_user_tenant_ids())
  AND get_user_role_in_tenant(tenant_id) IN ('admin', 'manager')
);

-- DELETE: admin only
CREATE POLICY "lot_zones_delete_admin_only"
ON public.lot_zones
FOR DELETE
USING (
  tenant_id IN (SELECT get_user_tenant_ids())
  AND get_user_role_in_tenant(tenant_id) IN ('admin')
);


-- =============================================================================
-- LOT_SPOTS TABLE
-- =============================================================================

ALTER TABLE public.lot_spots ENABLE ROW LEVEL SECURITY;

-- SELECT: All tenant members can view spots (via zone join for tenant check)
-- Note: Assumes lot_spots has a zone_id FK to lot_zones
CREATE POLICY "lot_spots_select_own_tenant"
ON public.lot_spots
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.lot_zones
    WHERE lot_zones.id = lot_spots.zone_id
      AND lot_zones.tenant_id IN (SELECT get_user_tenant_ids())
  )
);

-- INSERT: admin and manager only
CREATE POLICY "lot_spots_insert_admin_manager"
ON public.lot_spots
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.lot_zones
    WHERE lot_zones.id = lot_spots.zone_id
      AND lot_zones.tenant_id IN (SELECT get_user_tenant_ids())
  )
  AND get_user_role_in_tenant(
    (SELECT lot_zones.tenant_id FROM public.lot_zones WHERE lot_zones.id = lot_spots.zone_id)
  ) IN ('admin', 'manager')
);

-- UPDATE: admin and manager only
CREATE POLICY "lot_spots_update_admin_manager"
ON public.lot_spots
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.lot_zones
    WHERE lot_zones.id = lot_spots.zone_id
      AND lot_zones.tenant_id IN (SELECT get_user_tenant_ids())
  )
  AND get_user_role_in_tenant(
    (SELECT lot_zones.tenant_id FROM public.lot_zones WHERE lot_zones.id = lot_spots.zone_id)
  ) IN ('admin', 'manager')
);

-- DELETE: admin only
CREATE POLICY "lot_spots_delete_admin_only"
ON public.lot_spots
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.lot_zones
    WHERE lot_zones.id = lot_spots.zone_id
      AND lot_zones.tenant_id IN (SELECT get_user_tenant_ids())
  )
  AND get_user_role_in_tenant(
    (SELECT lot_zones.tenant_id FROM public.lot_zones WHERE lot_zones.id = lot_spots.zone_id)
  ) IN ('admin')
);


-- =============================================================================
-- WORK_DAYS TABLE
-- =============================================================================

ALTER TABLE public.work_days ENABLE ROW LEVEL SECURITY;

-- SELECT: All tenant members can view work days
CREATE POLICY "work_days_select_own_tenant"
ON public.work_days
FOR SELECT
USING (tenant_id IN (SELECT get_user_tenant_ids()));

-- INSERT: admin and manager only
CREATE POLICY "work_days_insert_admin_manager"
ON public.work_days
FOR INSERT
WITH CHECK (
  tenant_id IN (SELECT get_user_tenant_ids())
  AND get_user_role_in_tenant(tenant_id) IN ('admin', 'manager')
);

-- UPDATE: admin and manager only
CREATE POLICY "work_days_update_admin_manager"
ON public.work_days
FOR UPDATE
USING (
  tenant_id IN (SELECT get_user_tenant_ids())
  AND get_user_role_in_tenant(tenant_id) IN ('admin', 'manager')
);

-- DELETE: admin only
CREATE POLICY "work_days_delete_admin_only"
ON public.work_days
FOR DELETE
USING (
  tenant_id IN (SELECT get_user_tenant_ids())
  AND get_user_role_in_tenant(tenant_id) IN ('admin')
);


-- =============================================================================
-- TENANTS TABLE
-- =============================================================================
-- Users can only see their own tenant

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- SELECT: Users can only see their own tenant
CREATE POLICY "tenants_select_own"
ON public.tenants
FOR SELECT
USING (id IN (SELECT get_user_tenant_ids()));

-- UPDATE: Only admin can update tenant settings
CREATE POLICY "tenants_update_admin_only"
ON public.tenants
FOR UPDATE
USING (
  id IN (SELECT get_user_tenant_ids())
  AND get_user_role_in_tenant(id) IN ('admin')
);

-- INSERT/DELETE: Typically handled by platform admin, not tenant users
-- No policies - blocked by default
