-- SPDX-License-Identifier: AGPL-3.0-or-later
CREATE TABLE public.output_delivery_queue (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 route_id uuid NOT NULL, route_kind text NOT NULL CHECK(route_kind IN('route','zapier')),
 job_id uuid NOT NULL, event text NOT NULL, payload jsonb NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','delivering','sent','failed','uncertain')),
 attempts integer NOT NULL DEFAULT 0, lease uuid, lease_until timestamptz, next_attempt_at timestamptz NOT NULL DEFAULT now(),
 last_error text, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(route_kind,route_id,job_id,event)
);
ALTER TABLE public.output_delivery_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.output_delivery_queue FROM anon,authenticated;
GRANT ALL ON public.output_delivery_queue TO service_role;
CREATE POLICY output_delivery_read ON public.output_delivery_queue FOR SELECT TO authenticated USING(public.get_workspace_role(workspace_id) IN('owner','admin'));
GRANT SELECT ON public.output_delivery_queue TO authenticated;
CREATE FUNCTION public.queue_job_delivery() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_event text; v_routes uuid[]; v_name text; v_result text; v_title text; v_payload jsonb; v_agent uuid; v_team uuid;
BEGIN
 IF TG_OP='UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
 IF NEW.status NOT IN('running','completed','failed') THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='tasks' THEN
  v_agent:=NEW.assigned_agent_id;
  SELECT output_route_ids,name INTO v_routes,v_name FROM public.agents WHERE id=v_agent;
  v_result:=NEW.result #>> '{}'; v_title:=NEW.title;
  v_event:='task.'||CASE NEW.status WHEN 'running' THEN 'started' ELSE NEW.status END;
 ELSE
  v_team:=NEW.team_id;
  SELECT output_route_ids,name INTO v_routes,v_name FROM public.teams WHERE id=v_team;
  v_result:=NEW.output; v_title:=NEW.input_task;
  v_event:='team_run.'||CASE NEW.status WHEN 'running' THEN 'started' ELSE NEW.status END;
 END IF;
 v_payload:=jsonb_build_object('id',NEW.id,'event',v_event,'task_id',CASE WHEN TG_TABLE_NAME='tasks' THEN NEW.id END,
  'team_run_id',CASE WHEN TG_TABLE_NAME='team_runs' THEN NEW.id END,'task_title',v_title,'agent_name',coalesce(v_name,''),
  'status',NEW.status,'result_preview',left(v_result,500),'result_full',v_result,'error',to_jsonb(NEW)->>'error','timestamp',now(),'attachments','[]'::jsonb);
 INSERT INTO public.output_delivery_queue(workspace_id,route_id,route_kind,job_id,event,payload)
 SELECT NEW.workspace_id,r.id,'route',NEW.id,v_event,v_payload FROM public.output_routes r
 WHERE r.workspace_id=NEW.workspace_id AND r.is_active AND v_event=ANY(r.events) AND (v_routes IS NULL OR r.id=ANY(v_routes)) ON CONFLICT DO NOTHING;
 INSERT INTO public.output_delivery_queue(workspace_id,route_id,route_kind,job_id,event,payload)
 SELECT NEW.workspace_id,z.id,'zapier',NEW.id,v_event,v_payload FROM public.zapier_subscriptions z
 WHERE z.workspace_id=NEW.workspace_id AND z.event=v_event AND (z.agent_id IS NULL OR z.agent_id=v_agent) AND (z.team_id IS NULL OR z.team_id=v_team) ON CONFLICT DO NOTHING;
 RETURN NEW;
END;
$$;
CREATE TRIGGER durable_delivery AFTER INSERT OR UPDATE OF status ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.queue_job_delivery();
CREATE TRIGGER durable_delivery AFTER INSERT OR UPDATE OF status ON public.team_runs FOR EACH ROW EXECUTE FUNCTION public.queue_job_delivery();
CREATE FUNCTION public.claim_output_deliveries() RETURNS SETOF public.output_delivery_queue LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 -- Ambiguous interrupted writes are surfaced rather than blindly repeated.
 UPDATE public.output_delivery_queue SET state='uncertain',last_error='Worker disappeared during delivery' WHERE state='delivering' AND lease_until<now();
 RETURN QUERY UPDATE public.output_delivery_queue q SET state='delivering',lease=gen_random_uuid(),lease_until=now()+interval '2 minutes',attempts=attempts+1
 WHERE q.id IN(SELECT id FROM public.output_delivery_queue WHERE state='pending' AND next_attempt_at<=now() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 10) RETURNING q.*;
END;
$$;
REVOKE ALL ON FUNCTION public.queue_job_delivery(),public.claim_output_deliveries() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_output_deliveries() TO service_role;

CREATE TABLE public.interaction_responses (
 task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
 interaction_id uuid NOT NULL, step_id text NOT NULL DEFAULT '', response jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(task_id,interaction_id,step_id)
);
ALTER TABLE public.interaction_responses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.interaction_responses FROM anon,authenticated;
GRANT ALL ON public.interaction_responses TO service_role;
CREATE FUNCTION public.submit_interaction_response(p_workspace_id uuid,p_agent_id uuid,p_task_id uuid,p_response jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_task public.tasks%ROWTYPE; v_context jsonb;
BEGIN
 SELECT * INTO STRICT v_task FROM public.tasks WHERE id=p_task_id AND workspace_id=p_workspace_id AND assigned_agent_id=p_agent_id FOR UPDATE;
 v_context:=v_task.interaction_context;
 IF NOT(p_response ? 'interactionId') OR jsonb_typeof(p_response->'interactionId')<>'string' OR NOT(v_context ? 'requestedAt') OR NOT(v_context ? 'timeoutMs') THEN RAISE EXCEPTION 'Invalid interaction'; END IF;
 IF v_task.status<>'waiting_for_input' OR v_context->>'interactionId' IS DISTINCT FROM p_response->>'interactionId' THEN RAISE EXCEPTION 'Interaction is stale'; END IF;
 IF (v_context->>'requestedAt')::bigint+(v_context->>'timeoutMs')::bigint < extract(epoch FROM clock_timestamp())*1000 THEN RAISE EXCEPTION 'Interaction expired'; END IF;
 IF v_context->'wizard' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_context->'wizard'->'steps') step WHERE step->>'stepId'=p_response->>'wizardStepId') AND coalesce((p_response->>'wizardCancelled')::boolean,false)=false THEN RAISE EXCEPTION 'Invalid wizard step'; END IF;
 IF p_response ? 'approved' AND jsonb_typeof(p_response->'approved')<>'boolean' THEN RAISE EXCEPTION 'Approval must be boolean'; END IF;
 IF octet_length(p_response::text)>65536 THEN RAISE EXCEPTION 'Response too large'; END IF;
 INSERT INTO public.interaction_responses(task_id,interaction_id,step_id,response) VALUES(p_task_id,(p_response->>'interactionId')::uuid,coalesce(p_response->>'wizardStepId',''),p_response) ON CONFLICT DO NOTHING;
 RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_interaction_response(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.submit_interaction_response(uuid,uuid,uuid,jsonb) TO service_role;
