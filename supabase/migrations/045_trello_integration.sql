-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Copyright (C) 2026 CrewForm
--
-- 045_trello_integration.sql — Bidirectional Trello integration
--

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Add 'trello' to output_routes destination_type
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.output_routes
    DROP CONSTRAINT IF EXISTS output_routes_destination_type_check;

ALTER TABLE public.output_routes
    ADD CONSTRAINT output_routes_destination_type_check
    CHECK (destination_type IN ('http', 'slack', 'discord', 'telegram', 'teams', 'asana', 'trello'));

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Add 'trello' to messaging_channels platform
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.messaging_channels
    DROP CONSTRAINT IF EXISTS messaging_channels_platform_check;

ALTER TABLE public.messaging_channels
    ADD CONSTRAINT messaging_channels_platform_check
    CHECK (platform IN ('telegram', 'discord', 'slack', 'email', 'trello'));

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Trello card ↔ CrewForm task/run mapping table
--    Tracks the bidirectional link so agent results can update the original card.
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.trello_card_mappings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    trello_card_id  TEXT NOT NULL,
    trello_board_id TEXT NOT NULL,
    trello_list_id  TEXT,
    task_id         UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
    team_run_id     UUID REFERENCES public.team_runs(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- At least one of task_id or team_run_id must be set
    CONSTRAINT chk_task_or_run CHECK (
        task_id IS NOT NULL OR team_run_id IS NOT NULL
    )
);

CREATE INDEX idx_trello_card_mappings_workspace
    ON public.trello_card_mappings(workspace_id);

CREATE INDEX idx_trello_card_mappings_card
    ON public.trello_card_mappings(trello_card_id);

CREATE INDEX idx_trello_card_mappings_task
    ON public.trello_card_mappings(task_id)
    WHERE task_id IS NOT NULL;

CREATE INDEX idx_trello_card_mappings_run
    ON public.trello_card_mappings(team_run_id)
    WHERE team_run_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. RLS
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.trello_card_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trello_card_mappings_workspace_access"
    ON public.trello_card_mappings FOR ALL
    USING (workspace_id IN (
        SELECT id FROM public.workspaces WHERE owner_id = auth.uid()
    ))
    WITH CHECK (workspace_id IN (
        SELECT id FROM public.workspaces WHERE owner_id = auth.uid()
    ));
