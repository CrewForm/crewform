-- SPDX-License-Identifier: AGPL-3.0-or-later
CREATE FUNCTION public.fence_runner_write() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v_runner text:=current_setting('request.headers',true)::jsonb->>'x-crewform-runner-id';
BEGIN
 IF TG_OP='INSERT' AND NEW.status='running' AND v_runner IS NOT NULL THEN NEW.claimed_by_runner:=v_runner::uuid; END IF;
 IF TG_OP='UPDATE' AND v_runner IS NOT NULL AND OLD.status IN('completed','failed','cancelled') AND NEW.claimed_by_runner IS NOT NULL THEN RAISE EXCEPTION 'Terminal execution cannot be changed by a runner'; END IF;
 IF TG_OP='UPDATE' AND OLD.status IN('completed','failed','cancelled') AND NEW.claimed_by_runner IS NULL AND OLD.claimed_by_runner IS NOT NULL THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND OLD.status IN('running','waiting_for_input','paused') AND v_runner IS NOT NULL AND NEW.status NOT IN('dispatched','pending','cancelled')
    AND OLD.claimed_by_runner IS DISTINCT FROM v_runner::uuid
    AND NOT (NEW.status='failed' AND EXISTS(SELECT 1 FROM public.task_runners WHERE id=OLD.claimed_by_runner AND status='dead')) THEN RAISE EXCEPTION 'Stale runner cannot update execution'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER a_runner_fence BEFORE INSERT OR UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.fence_runner_write();
CREATE TRIGGER a_runner_fence BEFORE INSERT OR UPDATE ON public.team_runs FOR EACH ROW EXECUTE FUNCTION public.fence_runner_write();
REVOKE ALL ON FUNCTION public.fence_runner_write() FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.workspace_has_execution_capacity(p_workspace_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT NOT (SELECT hosted FROM public.deployment_policy WHERE singleton) OR
 ((SELECT count(*) FROM public.tasks WHERE workspace_id=w.id AND status IN('running','waiting_for_input'))+
  (SELECT count(*) FROM public.team_runs WHERE workspace_id=w.id AND status IN('running','paused')))
 < CASE WHEN w.trial_expires_at>now() THEN 10 WHEN w.plan='free' THEN 1 WHEN w.plan='pro' THEN 3 ELSE 10 END
 FROM public.workspaces w WHERE w.id=p_workspace_id;
$$;
REVOKE ALL ON FUNCTION public.workspace_has_execution_capacity(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_has_execution_capacity(uuid) TO service_role;

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
SET search_path='public'
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
     AND public.workspace_has_execution_capacity(w.id)
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
SET search_path='public'
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
     AND public.workspace_has_execution_capacity(w.id)
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


REVOKE ALL ON FUNCTION public.claim_next_task(uuid),public.claim_next_team_run(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_task(uuid),public.claim_next_team_run(uuid) TO service_role;
