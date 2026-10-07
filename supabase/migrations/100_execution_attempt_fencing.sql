-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Reclaiming on the same runner must not authorize writes from an older attempt.
ALTER TABLE public.tasks ADD COLUMN execution_attempt_id uuid;
ALTER TABLE public.team_runs ADD COLUMN execution_attempt_id uuid;
UPDATE public.tasks SET execution_attempt_id=gen_random_uuid() WHERE status IN('running','waiting_for_input');
UPDATE public.team_runs SET execution_attempt_id=gen_random_uuid() WHERE status IN('running','paused');
CREATE FUNCTION public.fence_execution_attempt() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v_headers jsonb:=current_setting('request.headers',true)::jsonb;v_runner text:=v_headers->>'x-crewform-runner-id';
BEGIN
 IF TG_OP='UPDATE' AND auth.role()='authenticated' AND NEW.execution_attempt_id IS DISTINCT FROM OLD.execution_attempt_id THEN RAISE EXCEPTION 'Execution attempt is server-owned'; END IF;
 IF TG_OP='UPDATE' AND v_runner IS NOT NULL AND OLD.status IN('running','waiting_for_input','paused') AND NEW.status NOT IN('cancelled','dispatched','pending')
  AND NOT(NEW.status='failed' AND EXISTS(SELECT 1 FROM public.task_runners WHERE id=OLD.claimed_by_runner AND status='dead')) THEN
  IF v_headers->>'x-crewform-execution-job' IS DISTINCT FROM OLD.id::text OR v_headers->>'x-crewform-execution-attempt' IS DISTINCT FROM OLD.execution_attempt_id::text THEN RAISE EXCEPTION 'Stale execution attempt'; END IF;
 END IF;
 IF NEW.status='running' AND (TG_OP='INSERT' OR OLD.status NOT IN('running','waiting_for_input','paused')) THEN NEW.execution_attempt_id:=gen_random_uuid();
 ELSIF TG_OP='INSERT' THEN NEW.execution_attempt_id:=NULL; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER ab_execution_attempt BEFORE INSERT OR UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.fence_execution_attempt();
CREATE TRIGGER ab_execution_attempt BEFORE INSERT OR UPDATE ON public.team_runs FOR EACH ROW EXECUTE FUNCTION public.fence_execution_attempt();
REVOKE ALL ON FUNCTION public.fence_execution_attempt() FROM PUBLIC,anon,authenticated;
