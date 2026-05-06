-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Copyright (C) 2026 CrewForm
--
-- 078_google_connections.sql — Google Workspace OAuth token storage + new output route types
--

-- ────────────────────────────────────────────────────────────────────────────
-- 1. google_connections — one per workspace
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.google_connections (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL UNIQUE REFERENCES public.workspaces(id) ON DELETE CASCADE,
    access_token    TEXT NOT NULL,
    refresh_token   TEXT NOT NULL,
    token_expiry    TIMESTAMPTZ NOT NULL,
    scopes          TEXT[] NOT NULL DEFAULT '{}',
    google_email    TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_google_connections_workspace
    ON public.google_connections(workspace_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 2. RLS
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.google_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "google_connections_workspace_access"
    ON public.google_connections FOR ALL
    USING (workspace_id IN (
        SELECT id FROM public.workspaces WHERE owner_id = auth.uid()
    ))
    WITH CHECK (workspace_id IN (
        SELECT id FROM public.workspaces WHERE owner_id = auth.uid()
    ));

-- Service role can read/write (for Edge Functions + task runner)
CREATE POLICY "google_connections_service_role"
    ON public.google_connections FOR ALL
    USING (true)
    WITH CHECK (true);

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Expand output_routes destination_type constraint
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.output_routes DROP CONSTRAINT IF EXISTS output_routes_destination_type_check;
ALTER TABLE public.output_routes ADD CONSTRAINT output_routes_destination_type_check
    CHECK (destination_type IN (
        'http', 'slack', 'discord', 'telegram', 'teams',
        'asana', 'trello', 'notion', 'github',
        'email', 'smtp', 'linear',
        'google_sheets', 'google_gmail', 'google_docs', 'google_calendar'
    ));
