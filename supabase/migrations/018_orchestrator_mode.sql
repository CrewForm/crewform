-- SPDX-License-Identifier: MIT
-- Copyright (C) 2026 CrewForm
--
-- 018_orchestrator_mode.sql — Orchestrator Mode: delegations table + support columns
--

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Add delegation_depth column to team_runs
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.team_runs
    ADD COLUMN IF NOT EXISTS delegation_depth INT NOT NULL DEFAULT 0;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Delegations table — tracks brain → worker delegation tree
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.delegations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_run_id     UUID NOT NULL REFERENCES public.team_runs(id) ON DELETE CASCADE,
    worker_agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
    instruction     TEXT NOT NULL,
    worker_output   TEXT,
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','running','completed','revision_requested','failed')),
    revision_count  INT NOT NULL DEFAULT 0,
    revision_feedback TEXT,
    quality_score   NUMERIC(3,2),
    parent_delegation_id UUID REFERENCES public.delegations(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_delegations_team_run ON public.delegations(team_run_id);
CREATE INDEX IF NOT EXISTS idx_delegations_status   ON public.delegations(status);

-- ────────────────────────────────────────────────────────────────────────────
-- 3. RLS — workspace-scoped via team_runs join
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.delegations ENABLE ROW LEVEL SECURITY;

-- Allow users to SELECT delegations for runs in their workspace
CREATE POLICY delegations_select_policy ON public.delegations
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.team_runs tr
            WHERE tr.id = delegations.team_run_id
              AND tr.workspace_id IN (
                  SELECT wm.workspace_id FROM public.workspace_members wm
                  WHERE wm.user_id = auth.uid()
              )
        )
    );

-- Allow service role full access (task runner uses service key)
CREATE POLICY delegations_service_policy ON public.delegations
    FOR ALL
    USING (auth.role() = 'service_role');

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Enable Supabase Realtime on delegations
-- ────────────────────────────────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE public.delegations;
