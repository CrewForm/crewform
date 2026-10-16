-- SPDX-License-Identifier: MIT
-- Copyright (C) 2026 CrewForm
--
-- 004_agent_tasks.sql — Per-agent execution records for individual task runs
-- Tracks tokens, cost, model, and result per agent invocation.

-- ────────────────────────────────────────────────────────────────────────────
-- agent_tasks — one execution record per agent per task
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.agent_tasks (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id           UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  agent_id          UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  workspace_id      UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  session_key       TEXT,                      -- unique key for streaming session
  result            JSONB,                     -- agent output (structured)
  error_message     TEXT,
  tokens_used       INTEGER NOT NULL DEFAULT 0,
  cost_estimate_usd DECIMAL(10,6) DEFAULT 0,
  model_used        TEXT,                      -- model used for this execution
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agent_tasks_task_id   ON public.agent_tasks(task_id);
CREATE INDEX idx_agent_tasks_agent_id  ON public.agent_tasks(agent_id);
CREATE INDEX idx_agent_tasks_workspace ON public.agent_tasks(workspace_id);
CREATE INDEX idx_agent_tasks_status    ON public.agent_tasks(status);

CREATE TRIGGER trg_agent_tasks_updated_at
  BEFORE UPDATE ON public.agent_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
