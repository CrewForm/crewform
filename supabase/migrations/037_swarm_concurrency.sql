-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Copyright (C) 2026 CrewForm
--
-- 037_swarm_concurrency.sql — Capacity-aware task claiming
--
-- Updates claim_next_task and claim_next_team_run to atomically check
-- the runner's current_load < max_concurrency before claiming, and
-- increment current_load on successful claim.

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Capacity-aware claim_next_task
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
DECLARE
  v_task_id UUID;
BEGIN
  -- Check runner capacity (if runner ID provided)
  IF p_runner_id IS NOT NULL THEN
    PERFORM 1 FROM public.task_runners
      WHERE task_runners.id = p_runner_id
        AND status = 'active'
        AND current_load < max_concurrency
      FOR UPDATE;

    IF NOT FOUND THEN
      -- Runner at capacity or not active
      RETURN;
    END IF;
  END IF;

  -- Claim the next available task
  SELECT t.id INTO v_task_id
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
   LIMIT 1;

  IF v_task_id IS NULL THEN
    RETURN;
  END IF;

  -- Update task status
  UPDATE public.tasks
     SET status = 'running',
         claimed_by_runner = p_runner_id,
         updated_at = NOW()
   WHERE tasks.id = v_task_id;

  -- Increment runner load
  IF p_runner_id IS NOT NULL THEN
    UPDATE public.task_runners
       SET current_load = current_load + 1
     WHERE task_runners.id = p_runner_id;
  END IF;

  RETURN QUERY
    SELECT tasks.id, tasks.workspace_id, tasks.title, tasks.description,
           tasks.assigned_agent_id, tasks.assigned_team_id, tasks.priority
      FROM public.tasks
     WHERE tasks.id = v_task_id;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Capacity-aware claim_next_team_run
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.claim_next_team_run(p_runner_id UUID DEFAULT NULL)
RETURNS SETOF public.team_runs
LANGUAGE plpgsql
AS $$
DECLARE
  claimed public.team_runs;
BEGIN
  -- Check runner capacity (if runner ID provided)
  IF p_runner_id IS NOT NULL THEN
    PERFORM 1 FROM public.task_runners
      WHERE task_runners.id = p_runner_id
        AND status = 'active'
        AND current_load < max_concurrency
      FOR UPDATE;

    IF NOT FOUND THEN
      RETURN;
    END IF;
  END IF;

  -- Claim the next available team run
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
   WHERE team_runs.id = claimed.id;

  -- Increment runner load
  IF p_runner_id IS NOT NULL THEN
    UPDATE public.task_runners
       SET current_load = current_load + 1
     WHERE task_runners.id = p_runner_id;
  END IF;

  claimed.status     := 'running';
  claimed.started_at := NOW();
  claimed.claimed_by_runner := p_runner_id;

  RETURN NEXT claimed;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Helper: decrement_runner_load — called by the runner when a task finishes
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.decrement_runner_load(p_runner_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.task_runners
     SET current_load = GREATEST(current_load - 1, 0)
   WHERE id = p_runner_id;
END;
$$;
