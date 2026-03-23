-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Copyright (C) 2026 CrewForm
--
-- 056_suspension_enforcement.sql
-- Enforces workspace suspension in task/team-run claiming and adds
-- a usage-stats RPC for the abuse monitoring dashboard.

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Suspension-aware claim_next_task
--    Skips tasks belonging to suspended workspaces.
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
      RETURN;
    END IF;
  END IF;

  -- Claim the next available task (excluding suspended workspaces)
  SELECT t.id INTO v_task_id
    FROM public.tasks t
    JOIN public.workspaces w ON w.id = t.workspace_id
   WHERE t.status = 'dispatched'
     AND t.assigned_agent_id IS NOT NULL
     AND t.assigned_team_id IS NULL
     AND w.suspended_at IS NULL
   ORDER BY
     CASE t.priority
       WHEN 'urgent' THEN 1
       WHEN 'high'   THEN 2
       WHEN 'medium' THEN 3
       WHEN 'low'    THEN 4
       ELSE 5
     END ASC,
     t.created_at ASC
   FOR UPDATE OF t SKIP LOCKED
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
-- 2. Suspension-aware claim_next_team_run
--    Skips team runs belonging to suspended workspaces.
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

  -- Claim the next available team run (excluding suspended workspaces)
  SELECT tr.*
    INTO claimed
    FROM public.team_runs tr
    JOIN public.workspaces w ON w.id = tr.workspace_id
   WHERE tr.status = 'pending'
     AND w.suspended_at IS NULL
   ORDER BY tr.created_at ASC
   LIMIT 1
     FOR UPDATE OF tr SKIP LOCKED;

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
-- 3. Auto-fail tasks/runs from suspended workspaces
--    Mark any pending/dispatched tasks and pending team runs for suspended
--    workspaces as failed, so they don't pile up in the queue.
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_suspend_workspace(
    p_workspace_id UUID,
    p_reason       TEXT DEFAULT 'Terms of Service violation'
)
RETURNS VOID AS $$
BEGIN
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Forbidden';
    END IF;

    UPDATE public.workspaces
    SET suspended_at     = NOW(),
        suspended_reason = p_reason
    WHERE id = p_workspace_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Workspace not found';
    END IF;

    -- Auto-fail queued tasks
    UPDATE public.tasks
       SET status    = 'failed',
           error     = 'Workspace suspended: ' || p_reason,
           updated_at = NOW()
     WHERE workspace_id = p_workspace_id
       AND status IN ('pending', 'dispatched');

    -- Auto-fail queued team runs
    UPDATE public.team_runs
       SET status    = 'failed',
           error     = 'Workspace suspended: ' || p_reason,
           completed_at = NOW()
     WHERE workspace_id = p_workspace_id
       AND status = 'pending';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Admin workspace usage stats RPC
--    Returns per-workspace usage aggregates for the abuse dashboard.
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_workspace_usage_stats(
    p_days INT DEFAULT 7
)
RETURNS TABLE (
    workspace_id   UUID,
    workspace_name TEXT,
    owner_id       UUID,
    plan           TEXT,
    suspended_at   TIMESTAMPTZ,
    task_count     BIGINT,
    team_run_count BIGINT,
    total_tokens   BIGINT,
    total_cost_usd NUMERIC
) AS $$
BEGIN
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Forbidden';
    END IF;

    RETURN QUERY
    SELECT
        w.id            AS workspace_id,
        w.name          AS workspace_name,
        w.owner_id      AS owner_id,
        w.plan          AS plan,
        w.suspended_at  AS suspended_at,
        COALESCE(t.cnt, 0)    AS task_count,
        COALESCE(tr.cnt, 0)   AS team_run_count,
        COALESCE(u.tokens, 0) AS total_tokens,
        COALESCE(u.cost, 0)   AS total_cost_usd
    FROM public.workspaces w
    LEFT JOIN (
        SELECT tasks.workspace_id AS ws, COUNT(*) AS cnt
          FROM public.tasks
         WHERE tasks.created_at >= NOW() - (p_days || ' days')::INTERVAL
         GROUP BY tasks.workspace_id
    ) t ON t.ws = w.id
    LEFT JOIN (
        SELECT team_runs.workspace_id AS ws, COUNT(*) AS cnt
          FROM public.team_runs
         WHERE team_runs.created_at >= NOW() - (p_days || ' days')::INTERVAL
         GROUP BY team_runs.workspace_id
    ) tr ON tr.ws = w.id
    LEFT JOIN (
        SELECT usage_records.workspace_id AS ws,
               SUM(usage_records.total_tokens)::BIGINT AS tokens,
               SUM(usage_records.cost_usd)             AS cost
          FROM public.usage_records
         WHERE usage_records.created_at >= NOW() - (p_days || ' days')::INTERVAL
         GROUP BY usage_records.workspace_id
    ) u ON u.ws = w.id
    ORDER BY COALESCE(u.cost, 0) DESC, COALESCE(t.cnt, 0) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
