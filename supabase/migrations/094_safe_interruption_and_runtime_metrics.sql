-- SPDX-License-Identifier: AGPL-3.0-or-later
-- In-flight provider calls and side effects cannot safely be replayed without checkpoints.
CREATE OR REPLACE FUNCTION public.recover_stale_tasks() RETURNS integer LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v_tasks integer;v_runs integer;
BEGIN
 UPDATE public.tasks SET status='failed',error='Execution interrupted. Review possible prior effects before creating a new run.',updated_at=now()
 WHERE status IN('running','waiting_for_input') AND claimed_by_runner IN(SELECT id FROM public.task_runners WHERE status='dead');
 GET DIAGNOSTICS v_tasks=ROW_COUNT;
 UPDATE public.team_runs SET status='failed',error_message='Execution interrupted. Review possible prior effects before creating a new run.',completed_at=now(),updated_at=now()
 WHERE status IN('running','paused') AND claimed_by_runner IN(SELECT id FROM public.task_runners WHERE status='dead');
 GET DIAGNOSTICS v_runs=ROW_COUNT;
 DELETE FROM public.task_runners WHERE status='dead';
 RETURN v_tasks+v_runs;
END;
$$;
REVOKE ALL ON FUNCTION public.recover_stale_tasks() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.recover_stale_tasks() TO service_role;
CREATE TABLE public.execution_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), job_kind text NOT NULL, job_id uuid NOT NULL,
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 runner_id uuid, backend text NOT NULL CHECK(backend IN('managed','self_hosted')),
 started_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz, terminal_status text
);
CREATE UNIQUE INDEX ON public.execution_attempts(job_kind,job_id) WHERE finished_at IS NULL;
ALTER TABLE public.execution_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.execution_attempts FROM anon,authenticated;
GRANT ALL ON public.execution_attempts TO service_role;
CREATE POLICY execution_attempts_read ON public.execution_attempts FOR SELECT TO authenticated USING(public.is_workspace_member(workspace_id));
GRANT SELECT ON public.execution_attempts TO authenticated;
CREATE FUNCTION public.track_execution_runtime() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.status='running' THEN
  INSERT INTO public.execution_attempts(job_kind,job_id,workspace_id,runner_id,backend)
  VALUES(TG_TABLE_NAME,NEW.id,NEW.workspace_id,NEW.claimed_by_runner,CASE WHEN (SELECT hosted FROM public.deployment_policy WHERE singleton) THEN 'managed' ELSE 'self_hosted' END) ON CONFLICT DO NOTHING;
 ELSIF NEW.status IN('completed','failed','cancelled','dispatched','pending') THEN
  UPDATE public.execution_attempts SET finished_at=now(),terminal_status=NEW.status WHERE job_kind=TG_TABLE_NAME AND job_id=NEW.id AND finished_at IS NULL;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER execution_runtime AFTER INSERT OR UPDATE OF status ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.track_execution_runtime();
CREATE TRIGGER execution_runtime AFTER INSERT OR UPDATE OF status ON public.team_runs FOR EACH ROW EXECUTE FUNCTION public.track_execution_runtime();
REVOKE ALL ON FUNCTION public.track_execution_runtime() FROM PUBLIC,anon,authenticated;
