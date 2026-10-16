-- SPDX-License-Identifier: MIT
-- Copyright (C) 2026 CrewForm
--
-- 008_new_tables_rls.sql — RLS policies for all tables added in 004–007
-- Uses existing helper functions: is_workspace_member(), get_workspace_role()

-- ════════════════════════════════════════════════════════════════════════════
-- agent_tasks
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.agent_tasks ENABLE ROW LEVEL SECURITY;

-- Members can read agent_tasks in their workspace
CREATE POLICY "agent_tasks_select" ON public.agent_tasks
  FOR SELECT USING (
    public.is_workspace_member(workspace_id)
  );

-- Members can create agent_tasks (task runner uses service role, but users
-- can also trigger via UI — the created task must be in their workspace)
CREATE POLICY "agent_tasks_insert" ON public.agent_tasks
  FOR INSERT WITH CHECK (
    public.is_workspace_member(workspace_id)
  );

-- Managers+ can update agent_tasks (status transitions during execution)
CREATE POLICY "agent_tasks_update" ON public.agent_tasks
  FOR UPDATE USING (
    public.get_workspace_role(workspace_id) IN ('owner', 'admin', 'manager')
  );

-- Managers+ can delete agent_tasks
CREATE POLICY "agent_tasks_delete" ON public.agent_tasks
  FOR DELETE USING (
    public.get_workspace_role(workspace_id) IN ('owner', 'admin', 'manager')
  );

-- ════════════════════════════════════════════════════════════════════════════
-- team_runs
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.team_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team_runs_select" ON public.team_runs
  FOR SELECT USING (
    public.is_workspace_member(workspace_id)
  );

CREATE POLICY "team_runs_insert" ON public.team_runs
  FOR INSERT WITH CHECK (
    public.is_workspace_member(workspace_id)
    AND created_by = (SELECT auth.uid())
  );

CREATE POLICY "team_runs_update" ON public.team_runs
  FOR UPDATE USING (
    created_by = (SELECT auth.uid())
    OR public.get_workspace_role(workspace_id) IN ('owner', 'admin', 'manager')
  );

CREATE POLICY "team_runs_delete" ON public.team_runs
  FOR DELETE USING (
    public.get_workspace_role(workspace_id) IN ('owner', 'admin', 'manager')
  );

-- ════════════════════════════════════════════════════════════════════════════
-- team_messages
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.team_messages ENABLE ROW LEVEL SECURITY;

-- Members can read messages from runs in their workspace
CREATE POLICY "team_messages_select" ON public.team_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.team_runs r
      WHERE r.id = run_id
        AND public.is_workspace_member(r.workspace_id)
    )
  );

-- Insert restricted to service role (Task Runner) — no user-facing INSERT policy
-- Task Runner uses SUPABASE_SERVICE_ROLE_KEY which bypasses RLS

-- ════════════════════════════════════════════════════════════════════════════
-- team_handoffs
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.team_handoffs ENABLE ROW LEVEL SECURITY;

-- Members can read handoffs from runs in their workspace
CREATE POLICY "team_handoffs_select" ON public.team_handoffs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.team_runs r
      WHERE r.id = run_id
        AND public.is_workspace_member(r.workspace_id)
    )
  );

-- Insert restricted to service role (Task Runner)

-- ════════════════════════════════════════════════════════════════════════════
-- user_profiles
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "user_profiles_select" ON public.user_profiles
  FOR SELECT USING (
    id = (SELECT auth.uid())
  );

-- Users can update their own profile
CREATE POLICY "user_profiles_update" ON public.user_profiles
  FOR UPDATE USING (
    id = (SELECT auth.uid())
  );

-- Insert handled by trigger (SECURITY DEFINER) — no user-facing INSERT policy needed
-- But allow users to insert their own profile as a fallback
CREATE POLICY "user_profiles_insert" ON public.user_profiles
  FOR INSERT WITH CHECK (
    id = (SELECT auth.uid())
  );

-- Users can delete their own profile (GDPR)
CREATE POLICY "user_profiles_delete" ON public.user_profiles
  FOR DELETE USING (
    id = (SELECT auth.uid())
  );

-- ════════════════════════════════════════════════════════════════════════════
-- usage_records
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.usage_records ENABLE ROW LEVEL SECURITY;

-- Members can read usage for their workspace
CREATE POLICY "usage_records_select" ON public.usage_records
  FOR SELECT USING (
    public.is_workspace_member(workspace_id)
  );

-- Insert restricted to service role (Task Runner / Edge Functions)

-- ════════════════════════════════════════════════════════════════════════════
-- audit_logs — INSERT-only by design
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Admins+ can read audit logs for their workspace
CREATE POLICY "audit_logs_select" ON public.audit_logs
  FOR SELECT USING (
    public.get_workspace_role(workspace_id) IN ('owner', 'admin')
  );

-- Insert restricted to service role (application layer logs actions)
-- No UPDATE or DELETE policies — audit logs are immutable

-- ════════════════════════════════════════════════════════════════════════════
-- voice_profiles
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.voice_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "voice_profiles_select" ON public.voice_profiles
  FOR SELECT USING (
    public.is_workspace_member(workspace_id)
  );

CREATE POLICY "voice_profiles_insert" ON public.voice_profiles
  FOR INSERT WITH CHECK (
    public.get_workspace_role(workspace_id) IN ('owner', 'admin', 'manager')
  );

CREATE POLICY "voice_profiles_update" ON public.voice_profiles
  FOR UPDATE USING (
    public.get_workspace_role(workspace_id) IN ('owner', 'admin', 'manager')
  );

CREATE POLICY "voice_profiles_delete" ON public.voice_profiles
  FOR DELETE USING (
    public.get_workspace_role(workspace_id) IN ('owner', 'admin', 'manager')
  );

-- ════════════════════════════════════════════════════════════════════════════
-- output_templates
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.output_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "output_templates_select" ON public.output_templates
  FOR SELECT USING (
    public.is_workspace_member(workspace_id)
  );

CREATE POLICY "output_templates_insert" ON public.output_templates
  FOR INSERT WITH CHECK (
    public.get_workspace_role(workspace_id) IN ('owner', 'admin', 'manager')
  );

CREATE POLICY "output_templates_update" ON public.output_templates
  FOR UPDATE USING (
    public.get_workspace_role(workspace_id) IN ('owner', 'admin', 'manager')
  );

CREATE POLICY "output_templates_delete" ON public.output_templates
  FOR DELETE USING (
    public.get_workspace_role(workspace_id) IN ('owner', 'admin', 'manager')
  );
