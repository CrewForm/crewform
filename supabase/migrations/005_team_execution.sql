-- SPDX-License-Identifier: MIT
-- Copyright (C) 2026 CrewForm
--
-- 005_team_execution.sql — Team run execution tables
-- Tables: team_runs, team_messages, team_handoffs

-- ────────────────────────────────────────────────────────────────────────────
-- team_runs — one execution of a team against an input task
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.team_runs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id           UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  workspace_id      UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'running', 'paused',
                                        'completed', 'failed', 'cancelled')),
  input_task        TEXT NOT NULL,              -- the human-provided task prompt
  output            TEXT,                       -- final synthesised result
  current_step_idx  INTEGER,                    -- Pipeline: active step index
  tokens_total      INTEGER NOT NULL DEFAULT 0,
  cost_estimate_usd DECIMAL(10,6) DEFAULT 0,
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  error_message     TEXT,
  created_by        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_team_runs_team_status ON public.team_runs(team_id, status);
CREATE INDEX idx_team_runs_workspace   ON public.team_runs(workspace_id);
CREATE INDEX idx_team_runs_created_by  ON public.team_runs(created_by);

CREATE TRIGGER trg_team_runs_updated_at
  BEFORE UPDATE ON public.team_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- team_messages — every message exchanged between agents in a run
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.team_messages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id            UUID NOT NULL REFERENCES public.team_runs(id) ON DELETE CASCADE,
  sender_agent_id   UUID REFERENCES public.agents(id) ON DELETE SET NULL,   -- NULL = system/user
  receiver_agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,   -- NULL = broadcast
  message_type      TEXT NOT NULL
                      CHECK (message_type IN ('delegation', 'handoff', 'broadcast',
                                              'tool_call', 'result', 'system',
                                              'rejection', 'revision_request')),
  content           TEXT NOT NULL,
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  step_idx          INTEGER,                   -- Pipeline: which step this belongs to
  tokens_used       INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_team_messages_run     ON public.team_messages(run_id, created_at);
CREATE INDEX idx_team_messages_sender  ON public.team_messages(sender_agent_id);

-- ────────────────────────────────────────────────────────────────────────────
-- team_handoffs — structured context passed between agents / pipeline steps
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.team_handoffs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          UUID NOT NULL REFERENCES public.team_runs(id) ON DELETE CASCADE,
  from_agent_id   UUID REFERENCES public.agents(id) ON DELETE SET NULL,   -- NULL = initial user input
  to_agent_id     UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  direction       TEXT NOT NULL CHECK (direction IN ('forward', 'backward')),
  context         JSONB NOT NULL,              -- TeamHandoffContext object
  feedback_reason TEXT,                        -- populated when direction = 'backward'
  step_idx        INTEGER,                     -- Pipeline: step being handed off
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_team_handoffs_run ON public.team_handoffs(run_id);
