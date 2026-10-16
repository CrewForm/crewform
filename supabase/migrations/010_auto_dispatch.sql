-- SPDX-License-Identifier: MIT
-- Copyright (C) 2026 CrewForm
--
-- 010_auto_dispatch.sql — Auto-dispatch trigger + dispatched status
--
-- Adds 'dispatched' to tasks.status, creates trigger to auto-create
-- agent_tasks records, and updates claim_next_task to claim dispatched tasks.

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Add 'dispatched' to tasks.status CHECK constraint
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('pending', 'dispatched', 'running', 'completed', 'failed', 'cancelled'));

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Auto-dispatch trigger: tasks.status → 'dispatched' creates agent_tasks
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.auto_dispatch_agent_task()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create agent_task for single-agent tasks (not team tasks)
  IF NEW.assigned_agent_id IS NOT NULL THEN
    INSERT INTO public.agent_tasks (task_id, agent_id, workspace_id, status, started_at)
    VALUES (NEW.id, NEW.assigned_agent_id, NEW.workspace_id, 'pending', NOW());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auto_dispatch_agent_task
  AFTER UPDATE ON public.tasks
  FOR EACH ROW
  WHEN (OLD.status = 'pending' AND NEW.status = 'dispatched')
  EXECUTE FUNCTION public.auto_dispatch_agent_task();

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Update claim_next_task to claim 'dispatched' tasks instead of 'pending'
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION claim_next_task()
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
