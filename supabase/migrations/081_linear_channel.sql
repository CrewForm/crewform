-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Copyright (C) 2026 CrewForm
--
-- 081_linear_channel.sql — Bidirectional Linear messaging channel
--
-- Adds 'linear' as a messaging channel platform and creates a mapping
-- table to link Linear issues to CrewForm tasks/team runs.
--

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Add 'linear' to messaging_channels platform constraint
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.messaging_channels
    DROP CONSTRAINT IF EXISTS messaging_channels_platform_check;

ALTER TABLE public.messaging_channels
    ADD CONSTRAINT messaging_channels_platform_check
    CHECK (platform IN ('telegram', 'discord', 'slack', 'email', 'trello', 'linear'));

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Linear issue ↔ CrewForm task/run mapping table
--    Tracks the bidirectional link so agent results can be posted back as
--    comments and issue state can be updated on completion.
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.linear_issue_mappings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    linear_issue_id TEXT NOT NULL,
    linear_team_id  TEXT NOT NULL,
    task_id         UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
    team_run_id     UUID REFERENCES public.team_runs(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_linear_task_or_run CHECK (
        task_id IS NOT NULL OR team_run_id IS NOT NULL
    )
);

CREATE INDEX IF NOT EXISTS idx_linear_issue_mappings_workspace
    ON public.linear_issue_mappings(workspace_id);

CREATE INDEX IF NOT EXISTS idx_linear_issue_mappings_issue
    ON public.linear_issue_mappings(linear_issue_id);

CREATE INDEX IF NOT EXISTS idx_linear_issue_mappings_task
    ON public.linear_issue_mappings(task_id)
    WHERE task_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_linear_issue_mappings_run
    ON public.linear_issue_mappings(team_run_id)
    WHERE team_run_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. RLS
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.linear_issue_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "linear_issue_mappings_workspace_access"
    ON public.linear_issue_mappings FOR ALL
    USING (workspace_id IN (
        SELECT id FROM public.workspaces WHERE owner_id = auth.uid()
    ))
    WITH CHECK (workspace_id IN (
        SELECT id FROM public.workspaces WHERE owner_id = auth.uid()
    ));

-- Service role can read/write (for Edge Functions + task runner)
CREATE POLICY "linear_issue_mappings_service_role"
    ON public.linear_issue_mappings FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
