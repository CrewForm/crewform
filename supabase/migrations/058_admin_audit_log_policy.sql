-- SPDX-License-Identifier: MIT
-- Copyright (C) 2026 CrewForm
--
-- 058_admin_audit_log_policy.sql
-- Adds super admin SELECT policy on the audit_log table (singular)
-- so the Admin Panel Activity tab can read all audit entries.

CREATE POLICY "super_admin_audit_log_select"
    ON public.audit_log FOR SELECT
    USING (public.is_super_admin());
