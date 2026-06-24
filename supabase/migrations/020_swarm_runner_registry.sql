-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Copyright (C) 2026 CrewForm
--
-- 020_swarm_runner_registry.sql — Runner registry, heartbeat, and task claiming
--

-- ────────────────────────────────────────────────────────────────────────────
-- 1. task_runners table — tracks active task runner instances
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.task_runners (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_name    TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active', 'draining', 'dead')),
  last_heartbeat   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  max_concurrency  INT NOT NULL DEFAULT 3,
  current_load     INT NOT NULL DEFAULT 0,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Track which runner claimed each task / team_run
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.tasks
  ADD COLUMN claimed_by_runner UUID REFERENCES public.task_runners(id) ON DELETE SET NULL;

ALTER TABLE public.team_runs
  ADD COLUMN claimed_by_runner UUID REFERENCES public.task_runners(id) ON DELETE SET NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Updated claim_next_task — accepts runner ID, stamps it on the claimed row
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION claim_next_task(p_runner_id UUID DEFAULT NULL)
RETURNS table (
  id uuid,
  workspace_id uuid,
  title text,
  description text,
  assigned_agent_id uuid,
  assigned_team_id uuid,
  priority text
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.tasks
  SET
    status = 'running',
    claimed_by_runner = p_runner_id,
    updated_at = NOW()
  WHERE tasks.id = (
    SELECT t.id
    FROM public.tasks t
    WHERE t.status = 'dispatched'
      AND t.assigned_agent_id IS NOT NULL
      AND t.assigned_team_id IS NULL
    ORDER BY
      CASE t.priority
        WHEN 'urgent' THEN 1
        WHEN 'high'   THEN 2
        WHEN 'medium' THEN 3
        WHEN 'low'    THEN 4
        ELSE 5
      END ASC,
      t.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING
    tasks.id,
    tasks.workspace_id,
    tasks.title,
    tasks.description,
    tasks.assigned_agent_id,
    tasks.assigned_team_id,
    tasks.priority;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Updated claim_next_team_run — accepts runner ID, stamps it
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.claim_next_team_run(p_runner_id UUID DEFAULT NULL)
RETURNS SETOF public.team_runs
LANGUAGE plpgsql
AS $$
DECLARE
  claimed public.team_runs;
BEGIN
  SELECT *
    INTO claimed
    FROM public.team_runs
   WHERE status = 'pending'
   ORDER BY created_at ASC
   LIMIT 1
     FOR UPDATE SKIP LOCKED;

  IF claimed.id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.team_runs
     SET status     = 'running',
         started_at = NOW(),
         claimed_by_runner = p_runner_id
   WHERE id = claimed.id;

  claimed.status     := 'running';
  claimed.started_at := NOW();
  claimed.claimed_by_runner := p_runner_id;

  RETURN NEXT claimed;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. mark_stale_runners — marks runners as 'dead' when heartbeat is stale
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.mark_stale_runners(stale_threshold INTERVAL DEFAULT '30 seconds')
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  affected INT;
BEGIN
  UPDATE public.task_runners
     SET status = 'dead'
   WHERE status = 'active'
     AND last_heartbeat < NOW() - stale_threshold;

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. recover_stale_tasks — resets orphaned tasks from dead runners
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.recover_stale_tasks()
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  tasks_recovered INT := 0;
  runs_recovered INT := 0;
BEGIN
  -- Recover orphaned tasks
  UPDATE public.tasks
     SET status = 'dispatched',
         claimed_by_runner = NULL,
         updated_at = NOW()
   WHERE status = 'running'
     AND claimed_by_runner IN (
       SELECT id FROM public.task_runners WHERE status = 'dead'
     );
  GET DIAGNOSTICS tasks_recovered = ROW_COUNT;

  -- Recover orphaned team runs
  UPDATE public.team_runs
     SET status = 'pending',
         claimed_by_runner = NULL,
         started_at = NULL,
         updated_at = NOW()
   WHERE status = 'running'
     AND claimed_by_runner IN (
       SELECT id FROM public.task_runners WHERE status = 'dead'
     );
  GET DIAGNOSTICS runs_recovered = ROW_COUNT;

  -- Clean up dead runners
  DELETE FROM public.task_runners WHERE status = 'dead';

  RETURN tasks_recovered + runs_recovered;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 7. RLS — task_runners is a service-only table (no user access needed)
--    The task runner uses service_role key which bypasses RLS.
--    Enable RLS and deny all for safety.
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.task_runners ENABLE ROW LEVEL SECURITY;

-- Service role can read runner status; later migrations add super-admin observability.
CREATE POLICY "task_runners_select" ON public.task_runners
  FOR SELECT TO service_role USING (true);
