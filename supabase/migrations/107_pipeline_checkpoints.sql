-- SPDX-License-Identifier: MIT
-- A committed boundary is recoverable. An in-flight call is deliberately not.
CREATE TABLE public.pipeline_checkpoints (
 run_id uuid PRIMARY KEY REFERENCES public.team_runs(id) ON DELETE CASCADE,
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 configuration jsonb NOT NULL,
 file_context text NOT NULL DEFAULT '', memories jsonb NOT NULL DEFAULT '[]',
 results jsonb NOT NULL DEFAULT '[]', next_step integer NOT NULL DEFAULT 0,
 in_flight integer, attempt_id uuid NOT NULL,
 approval jsonb, decisions jsonb NOT NULL DEFAULT '[]', revision integer NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(next_step BETWEEN 0 AND 100), CHECK(jsonb_array_length(results)=next_step),
 CHECK(octet_length(results::text)+octet_length(configuration::text)+octet_length(file_context)+octet_length(memories::text)<8388608)
);
ALTER TABLE public.pipeline_checkpoints ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pipeline_checkpoints FROM anon,authenticated,service_role;
GRANT SELECT ON public.pipeline_checkpoints TO authenticated,service_role;
CREATE POLICY pipeline_checkpoints_read ON public.pipeline_checkpoints FOR SELECT TO authenticated
 USING(public.is_workspace_member(workspace_id));

CREATE FUNCTION public.pipeline_configuration(p_run uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('version',1,'input',r.input_task,
  'team',to_jsonb(t)-'updated_at'-'created_at',
  'agents',coalesce((SELECT jsonb_object_agg(a.id,to_jsonb(a)-'status'-'updated_at'-'created_at')
   FROM public.agents a WHERE a.workspace_id=r.workspace_id AND
    (t.config::text LIKE '%'||a.id::text||'%' OR EXISTS(SELECT 1 FROM public.team_members m WHERE m.team_id=t.id AND m.agent_id=a.id))),'{}'),
  'files',public.native_input_files(r.workspace_id,NULL,r.id),
  'dependencies',encode(extensions.digest(jsonb_build_object(
   'tools',(SELECT jsonb_agg(to_jsonb(c)-'updated_at'-'created_at' ORDER BY c.id) FROM public.custom_tools c WHERE c.workspace_id=r.workspace_id),
   'voices',(SELECT jsonb_agg(to_jsonb(v)-'updated_at'-'created_at' ORDER BY v.id) FROM public.voice_profiles v WHERE v.workspace_id=r.workspace_id),
   'templates',(SELECT jsonb_agg(to_jsonb(o)-'updated_at'-'created_at' ORDER BY o.id) FROM public.output_templates o WHERE o.workspace_id=r.workspace_id)
  )::text,'sha256'),'hex'))
 FROM public.team_runs r JOIN public.teams t ON t.id=r.team_id AND t.workspace_id=r.workspace_id WHERE r.id=p_run;
$$;

CREATE FUNCTION public.lock_pipeline_attempt(p_run uuid,p_attempt uuid) RETURNS public.team_runs
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.team_runs; h jsonb:=current_setting('request.headers',true)::jsonb;
BEGIN
 PERFORM 1 FROM public.workspaces WHERE id=(SELECT workspace_id FROM public.team_runs WHERE id=p_run) FOR UPDATE;
 SELECT * INTO STRICT r FROM public.team_runs WHERE id=p_run FOR UPDATE;
 IF r.status<>'running' OR r.execution_attempt_id IS DISTINCT FROM p_attempt
  OR h->>'x-crewform-runner-id' IS DISTINCT FROM r.claimed_by_runner::text
  OR h->>'x-crewform-execution-job' IS DISTINCT FROM r.id::text
  OR h->>'x-crewform-execution-attempt' IS DISTINCT FROM p_attempt::text
  OR NOT EXISTS(SELECT 1 FROM public.task_runners WHERE id=r.claimed_by_runner AND status='active')
 THEN RAISE EXCEPTION 'Pipeline execution cancelled or attempt lost'; END IF;
 RETURN r;
END;
$$;

CREATE FUNCTION public.open_pipeline_checkpoint(p_run uuid,p_attempt uuid,p_file_context text,p_memories jsonb)
RETURNS public.pipeline_checkpoints LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.team_runs; c public.pipeline_checkpoints; configuration jsonb;
BEGIN
 r:=public.lock_pipeline_attempt(p_run,p_attempt);
 configuration:=public.pipeline_configuration(p_run);
 IF configuration->'team'->>'mode'<>'pipeline' OR jsonb_array_length(configuration->'team'->'config'->'steps') NOT BETWEEN 1 AND 100
 THEN RAISE EXCEPTION 'Checkpoint pipelines require 1 to 100 steps'; END IF;
 INSERT INTO public.pipeline_checkpoints(run_id,workspace_id,configuration,file_context,memories,attempt_id)
 VALUES(r.id,r.workspace_id,configuration,p_file_context,p_memories,p_attempt) ON CONFLICT DO NOTHING;
 SELECT * INTO STRICT c FROM public.pipeline_checkpoints WHERE run_id=p_run FOR UPDATE;
 IF c.configuration IS DISTINCT FROM configuration THEN RAISE EXCEPTION 'Pipeline inputs or configuration changed; create a new run'; END IF;
 IF c.in_flight IS NOT NULL THEN RAISE EXCEPTION 'Prior step outcome is uncertain; review effects and create a new run'; END IF;
 IF c.approval IS NOT NULL THEN RAISE EXCEPTION 'Pipeline requires an explicit human decision'; END IF;
 UPDATE public.pipeline_checkpoints SET attempt_id=p_attempt,updated_at=now() WHERE run_id=p_run RETURNING * INTO c;
 RETURN c;
END;
$$;

CREATE FUNCTION public.write_pipeline_step(p_run uuid,p_attempt uuid,p_step integer,p_complete boolean,p_result jsonb DEFAULT NULL)
RETURNS public.pipeline_checkpoints LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.team_runs; c public.pipeline_checkpoints;
BEGIN
 r:=public.lock_pipeline_attempt(p_run,p_attempt);
 SELECT * INTO STRICT c FROM public.pipeline_checkpoints WHERE run_id=p_run FOR UPDATE;
 IF c.attempt_id IS DISTINCT FROM p_attempt OR c.next_step<>p_step OR c.approval IS NOT NULL
  OR c.configuration IS DISTINCT FROM public.pipeline_configuration(p_run)
 THEN RAISE EXCEPTION 'Pipeline checkpoint is stale or configuration changed'; END IF;
 IF p_complete THEN
  IF c.in_flight IS DISTINCT FROM p_step THEN RAISE EXCEPTION 'Step was not started by this attempt'; END IF;
  IF p_result IS NOT NULL AND (jsonb_typeof(p_result)<>'object' OR jsonb_typeof(p_result->'output') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_result->'usage') IS DISTINCT FROM 'object') THEN RAISE EXCEPTION 'Invalid step result'; END IF;
  UPDATE public.pipeline_checkpoints SET results=results||jsonb_build_array(p_result),next_step=next_step+1,in_flight=NULL,
   revision=revision+1,updated_at=now() WHERE run_id=p_run RETURNING * INTO c;
  UPDATE public.team_runs SET
   tokens_total=(SELECT coalesce(sum((value->'usage'->>'totalTokens')::bigint),0) FROM jsonb_array_elements(c.results)),
   cost_estimate_usd=(SELECT coalesce(sum((value->'usage'->>'costEstimateUSD')::numeric),0) FROM jsonb_array_elements(c.results)),
   updated_at=now() WHERE id=p_run;
 ELSE
  IF c.in_flight IS NOT NULL THEN RAISE EXCEPTION 'Step outcome is uncertain'; END IF;
  IF p_step>=jsonb_array_length(c.configuration->'team'->'config'->'steps') THEN RAISE EXCEPTION 'No remaining pipeline step'; END IF;
  UPDATE public.pipeline_checkpoints SET in_flight=p_step,revision=revision+1,updated_at=now() WHERE run_id=p_run RETURNING * INTO c;
 END IF;
 RETURN c;
END;
$$;

CREATE FUNCTION public.pause_pipeline_boundary(p_run uuid,p_attempt uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.team_runs; c public.pipeline_checkpoints;
BEGIN
 r:=public.lock_pipeline_attempt(p_run,p_attempt);
 SELECT * INTO STRICT c FROM public.pipeline_checkpoints WHERE run_id=p_run FOR UPDATE;
 IF c.in_flight IS NOT NULL OR c.attempt_id IS DISTINCT FROM p_attempt THEN RAISE EXCEPTION 'Pipeline is not at a committed boundary'; END IF;
 UPDATE public.pipeline_checkpoints SET approval=jsonb_build_object('id',gen_random_uuid(),'step',next_step,'expiresAt',now()+interval '24 hours'),
  revision=revision+1,updated_at=now() WHERE run_id=p_run;
 UPDATE public.team_runs SET status='paused',updated_at=now() WHERE id=p_run;
END;
$$;

CREATE FUNCTION public.continue_pipeline_run(p_run uuid,p_revision integer,p_approval uuid DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.team_runs; c public.pipeline_checkpoints; actor uuid:=auth.uid(); role text;
BEGIN
 -- Quota triggers acquire the workspace first; keep the same lock order.
 PERFORM 1 FROM public.workspaces WHERE id=(SELECT workspace_id FROM public.team_runs WHERE id=p_run) FOR UPDATE;
 SELECT * INTO STRICT r FROM public.team_runs WHERE id=p_run FOR UPDATE;
 role:=public.get_workspace_role(r.workspace_id);
 IF actor IS NULL OR role IS NULL OR role NOT IN('owner','admin','member')
  OR (r.created_by<>actor AND role NOT IN('owner','admin'))
  OR (r.native_consent IS NOT NULL AND r.created_by<>actor)
 THEN RAISE EXCEPTION 'Not authorized to continue this pipeline'; END IF;
 IF r.status NOT IN('failed','paused') THEN RAISE EXCEPTION 'Pipeline is not awaiting continuation'; END IF;
 SELECT * INTO STRICT c FROM public.pipeline_checkpoints WHERE run_id=p_run FOR UPDATE;
 IF c.revision<>p_revision THEN RAISE EXCEPTION 'Pipeline decision is stale'; END IF;
 IF c.in_flight IS NOT NULL THEN RAISE EXCEPTION 'Prior step outcome is uncertain; review effects and create a new run'; END IF;
 IF c.configuration IS DISTINCT FROM public.pipeline_configuration(p_run) THEN RAISE EXCEPTION 'Pipeline inputs or configuration changed; create a new run'; END IF;
 IF c.approval IS NOT NULL AND ((c.approval->>'id')::uuid IS DISTINCT FROM p_approval OR (c.approval->>'expiresAt')::timestamptz<=now())
 THEN RAISE EXCEPTION 'Pipeline approval is stale or expired'; END IF;
 UPDATE public.pipeline_checkpoints SET approval=NULL,decisions=decisions||jsonb_build_array(jsonb_build_object(
  'actor',actor,'at',now(),'nextStep',next_step,'approvalId',p_approval,'revision',revision)),revision=revision+1,updated_at=now() WHERE run_id=p_run;
 UPDATE public.team_runs SET status='pending',claimed_by_runner=NULL,completed_at=NULL,error_message=NULL,updated_at=now() WHERE id=p_run;
 INSERT INTO public.team_messages(run_id,message_type,content,metadata,step_idx,tokens_used)
 VALUES(p_run,'system','Human approved continuation from a committed step boundary.',jsonb_build_object('actor',actor,'checkpoint_revision',p_revision),c.next_step,0);
END;
$$;

-- A browser cannot bypass the decision RPC by directly requeueing a run.
CREATE FUNCTION public.protect_pipeline_continuation() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF current_user NOT IN('postgres','supabase_admin','service_role') AND NEW.status='pending' AND OLD.status<>'pending'
  AND EXISTS(SELECT 1 FROM public.pipeline_checkpoints WHERE run_id=OLD.id)
 THEN RAISE EXCEPTION 'Use the pipeline continuation action'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER ac_pipeline_continuation BEFORE UPDATE ON public.team_runs FOR EACH ROW EXECUTE FUNCTION public.protect_pipeline_continuation();

-- Preserve the active-write guard, with one narrow exception for the owner-
-- checked SECURITY DEFINER continuation RPC after it persisted the decision.
CREATE OR REPLACE FUNCTION public.protect_execution_state() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_TABLE_NAME='team_runs' AND current_user IN('postgres','supabase_admin') AND NEW.status='pending' AND OLD.status IN('paused','failed')
  AND EXISTS(SELECT 1 FROM public.pipeline_checkpoints c WHERE c.run_id=OLD.id AND c.in_flight IS NULL AND c.approval IS NULL
   AND c.decisions->-1->>'actor'=auth.uid()::text) THEN RETURN NEW; END IF;
 IF auth.role()='authenticated' AND NOT public.is_super_admin() AND TG_OP='UPDATE' THEN
  IF OLD.status IN('running','waiting_for_input','paused') AND
   ((to_jsonb(NEW)-'status'-'updated_at') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'updated_at') OR NEW.status NOT IN(OLD.status,'cancelled')) THEN
   RAISE EXCEPTION 'Active execution is server-owned; cancel before editing';
  END IF;
  IF NEW.status NOT IN('pending','dispatched') AND
   ((to_jsonb(NEW)->'interaction_context') IS DISTINCT FROM (to_jsonb(OLD)->'interaction_context') OR
    (to_jsonb(NEW)->'result') IS DISTINCT FROM (to_jsonb(OLD)->'result') OR
    (to_jsonb(NEW)->'output') IS DISTINCT FROM (to_jsonb(OLD)->'output') OR
    (to_jsonb(NEW)->'claimed_by_runner') IS DISTINCT FROM (to_jsonb(OLD)->'claimed_by_runner')) THEN RAISE EXCEPTION 'Execution results and interaction state are server-owned'; END IF;
 END IF;
 RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.pipeline_configuration(uuid),public.lock_pipeline_attempt(uuid,uuid),public.open_pipeline_checkpoint(uuid,uuid,text,jsonb),
 public.write_pipeline_step(uuid,uuid,integer,boolean,jsonb),public.pause_pipeline_boundary(uuid,uuid),public.continue_pipeline_run(uuid,integer,uuid),public.protect_pipeline_continuation() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.open_pipeline_checkpoint(uuid,uuid,text,jsonb),public.write_pipeline_step(uuid,uuid,integer,boolean,jsonb),public.pause_pipeline_boundary(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.continue_pipeline_run(uuid,integer,uuid) TO authenticated;
