-- SPDX-License-Identifier: MIT
-- Copyright (C) 2026 CrewForm
--
-- 002_rls_policies.sql — Row-Level Security on every table
-- Uses (SELECT auth.uid()) caching pattern for performance.

-- ────────────────────────────────────────────────────────────────────────────
-- Helper functions
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_workspace_member(ws_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_members
    WHERE workspace_id = ws_id
      AND user_id = (SELECT auth.uid())
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.get_workspace_role(ws_id UUID)
RETURNS TEXT AS $$
  SELECT role
  FROM public.workspace_members
  WHERE workspace_id = ws_id
    AND user_id = (SELECT auth.uid())
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ────────────────────────────────────────────────────────────────────────────
-- workspaces
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

-- Members can read their workspaces
CREATE POLICY "workspace_select" ON public.workspaces
  FOR SELECT USING (
    public.is_workspace_member(id)
  );

-- Only owner can insert (auto-workspace trigger uses SECURITY DEFINER)
CREATE POLICY "workspace_insert" ON public.workspaces
  FOR INSERT WITH CHECK (
    owner_id = (SELECT auth.uid())
  );

-- Only owner can update
CREATE POLICY "workspace_update" ON public.workspaces
  FOR UPDATE USING (
    owner_id = (SELECT auth.uid())
  );

-- Only owner can delete
CREATE POLICY "workspace_delete" ON public.workspaces
  FOR DELETE USING (
    owner_id = (SELECT auth.uid())
  );

-- ────────────────────────────────────────────────────────────────────────────
-- workspace_members
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

-- Members can see other members in their workspace
CREATE POLICY "workspace_members_select" ON public.workspace_members
  FOR SELECT USING (
    public.is_workspace_member(workspace_id)
  );

-- Admins+ can add members
CREATE POLICY "workspace_members_insert" ON public.workspace_members
  FOR INSERT WITH CHECK (
    public.get_workspace_role(workspace_id) IN ('owner', 'admin')
  );

-- Admins+ can update member roles
CREATE POLICY "workspace_members_update" ON public.workspace_members
  FOR UPDATE USING (
    public.get_workspace_role(workspace_id) IN ('owner', 'admin')
  );

-- Admins+ can remove members
CREATE POLICY "workspace_members_delete" ON public.workspace_members
  FOR DELETE USING (
    public.get_workspace_role(workspace_id) IN ('owner', 'admin')
  );

-- ────────────────────────────────────────────────────────────────────────────
-- agents
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

-- Members can read agents in their workspace
CREATE POLICY "agents_select" ON public.agents
  FOR SELECT USING (
    public.is_workspace_member(workspace_id)
  );

-- Managers+ can create agents
CREATE POLICY "agents_insert" ON public.agents
  FOR INSERT WITH CHECK (
    public.get_workspace_role(workspace_id) IN ('owner', 'admin', 'manager')
  );

-- Managers+ can update agents
CREATE POLICY "agents_update" ON public.agents
  FOR UPDATE USING (
    public.get_workspace_role(workspace_id) IN ('owner', 'admin', 'manager')
  );

-- Managers+ can delete agents
CREATE POLICY "agents_delete" ON public.agents
  FOR DELETE USING (
    public.get_workspace_role(workspace_id) IN ('owner', 'admin', 'manager')
  );

-- ────────────────────────────────────────────────────────────────────────────
-- teams
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

-- Members can read teams
CREATE POLICY "teams_select" ON public.teams
  FOR SELECT USING (
    public.is_workspace_member(workspace_id)
  );

-- Managers+ can create teams
CREATE POLICY "teams_insert" ON public.teams
  FOR INSERT WITH CHECK (
    public.get_workspace_role(workspace_id) IN ('owner', 'admin', 'manager')
  );

-- Managers+ can update teams
CREATE POLICY "teams_update" ON public.teams
  FOR UPDATE USING (
    public.get_workspace_role(workspace_id) IN ('owner', 'admin', 'manager')
  );

-- Managers+ can delete teams
CREATE POLICY "teams_delete" ON public.teams
  FOR DELETE USING (
    public.get_workspace_role(workspace_id) IN ('owner', 'admin', 'manager')
  );

-- ────────────────────────────────────────────────────────────────────────────
-- team_members
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- Members can read team members (via team → workspace membership)
CREATE POLICY "team_members_select" ON public.team_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = team_id
        AND public.is_workspace_member(t.workspace_id)
    )
  );

-- Managers+ can manage team members
CREATE POLICY "team_members_insert" ON public.team_members
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = team_id
        AND public.get_workspace_role(t.workspace_id) IN ('owner', 'admin', 'manager')
    )
  );

CREATE POLICY "team_members_update" ON public.team_members
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = team_id
        AND public.get_workspace_role(t.workspace_id) IN ('owner', 'admin', 'manager')
    )
  );

CREATE POLICY "team_members_delete" ON public.team_members
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = team_id
        AND public.get_workspace_role(t.workspace_id) IN ('owner', 'admin', 'manager')
    )
  );

-- ────────────────────────────────────────────────────────────────────────────
-- tasks
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- Members can read tasks in their workspace
CREATE POLICY "tasks_select" ON public.tasks
  FOR SELECT USING (
    public.is_workspace_member(workspace_id)
  );

-- Members can create tasks
CREATE POLICY "tasks_insert" ON public.tasks
  FOR INSERT WITH CHECK (
    public.is_workspace_member(workspace_id)
    AND created_by = (SELECT auth.uid())
  );

-- Own tasks or managers+ can update
CREATE POLICY "tasks_update" ON public.tasks
  FOR UPDATE USING (
    created_by = (SELECT auth.uid())
    OR public.get_workspace_role(workspace_id) IN ('owner', 'admin', 'manager')
  );

-- Own tasks or managers+ can delete
CREATE POLICY "tasks_delete" ON public.tasks
  FOR DELETE USING (
    created_by = (SELECT auth.uid())
    OR public.get_workspace_role(workspace_id) IN ('owner', 'admin', 'manager')
  );

-- ────────────────────────────────────────────────────────────────────────────
-- api_keys
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- Members can read API key metadata (not decrypted key)
CREATE POLICY "api_keys_select" ON public.api_keys
  FOR SELECT USING (
    public.is_workspace_member(workspace_id)
  );

-- Admins+ can create API keys
CREATE POLICY "api_keys_insert" ON public.api_keys
  FOR INSERT WITH CHECK (
    public.get_workspace_role(workspace_id) IN ('owner', 'admin')
  );

-- Admins+ can update API keys
CREATE POLICY "api_keys_update" ON public.api_keys
  FOR UPDATE USING (
    public.get_workspace_role(workspace_id) IN ('owner', 'admin')
  );

-- Admins+ can delete API keys
CREATE POLICY "api_keys_delete" ON public.api_keys
  FOR DELETE USING (
    public.get_workspace_role(workspace_id) IN ('owner', 'admin')
  );
