-- SPDX-License-Identifier: MIT
-- Copyright (C) 2026 CrewForm
--
-- 031_zapier_subscriptions.sql — Stores Zapier REST Hook subscriptions
-- Zapier calls POST /api-hooks to subscribe and DELETE /api-hooks?id= to unsubscribe.

-- ─── Table ──────────────────────────────────────────────────────────────────

CREATE TABLE public.zapier_subscriptions (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    event       text NOT NULL,                          -- e.g. 'task.completed', 'team_run.failed'
    target_url  text NOT NULL,                          -- Zapier's callback URL
    api_key_id  uuid REFERENCES public.rest_api_keys(id) ON DELETE CASCADE,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_zapier_subs_workspace_event ON public.zapier_subscriptions(workspace_id, event);

-- ─── RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE public.zapier_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "zapier_subs_select" ON public.zapier_subscriptions
    FOR SELECT USING (
        workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())
    );

CREATE POLICY "zapier_subs_insert" ON public.zapier_subscriptions
    FOR INSERT WITH CHECK (
        workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())
    );

CREATE POLICY "zapier_subs_delete" ON public.zapier_subscriptions
    FOR DELETE USING (
        workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())
    );
