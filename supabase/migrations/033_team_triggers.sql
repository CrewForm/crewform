-- SPDX-License-Identifier: MIT
-- Copyright (C) 2026 CrewForm
--
-- 033_team_triggers.sql — Allow triggers to target teams, not just agents
--

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Add team_id column to agent_triggers
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.agent_triggers
  ADD COLUMN team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Make agent_id nullable (trigger targets EITHER an agent OR a team)
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.agent_triggers
  ALTER COLUMN agent_id DROP NOT NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Add CHECK: exactly one of agent_id / team_id must be set
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.agent_triggers
  ADD CONSTRAINT chk_trigger_target
    CHECK (
      (agent_id IS NOT NULL AND team_id IS NULL)
      OR (agent_id IS NULL AND team_id IS NOT NULL)
    );

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Index for team-based trigger lookups
-- ────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_triggers_team
  ON public.agent_triggers(team_id) WHERE team_id IS NOT NULL;
