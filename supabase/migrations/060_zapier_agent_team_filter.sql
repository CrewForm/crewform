-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Copyright (C) 2026 CrewForm
--
-- 060_zapier_agent_team_filter.sql — Add optional agent/team filtering to
-- Zapier subscriptions so Zaps can fire for specific agents or teams instead
-- of the entire workspace.

-- ─── Add filter columns ─────────────────────────────────────────────────────

ALTER TABLE public.zapier_subscriptions
  ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES public.agents(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS team_id  UUID REFERENCES public.teams(id)  ON DELETE CASCADE;

-- Index for the dispatcher query: workspace + event + agent/team lookup
CREATE INDEX IF NOT EXISTS idx_zapier_subs_agent
  ON public.zapier_subscriptions(workspace_id, event, agent_id);

CREATE INDEX IF NOT EXISTS idx_zapier_subs_team
  ON public.zapier_subscriptions(workspace_id, event, team_id);
