-- SPDX-License-Identifier: MIT
-- Personal pipeline jobs consume the parent workflow's reservation. They are
-- separate from tasks, so one step cannot double-charge hosting run/concurrency.
DROP INDEX public.one_personal_device;
CREATE INDEX personal_device_owner ON public.personal_devices(user_id);
CREATE FUNCTION public.limit_personal_devices() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM 1 FROM auth.users WHERE id=NEW.user_id FOR UPDATE;
 IF (SELECT count(*) FROM public.personal_devices WHERE user_id=NEW.user_id AND revoked_at IS NULL AND approved_until>now())>=6 THEN RAISE EXCEPTION 'Revoke an existing device profile before approving more than six'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER limit_personal_devices BEFORE INSERT ON public.personal_devices FOR EACH ROW EXECUTE FUNCTION public.limit_personal_devices();
CREATE TABLE public.personal_pipeline_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 run_id uuid NOT NULL REFERENCES public.team_runs(id) ON DELETE CASCADE,
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 parent_attempt uuid NOT NULL,step_idx integer NOT NULL,
 agent_id uuid NOT NULL,device_id uuid REFERENCES public.personal_devices(id) ON DELETE SET NULL,
 agent_snapshot jsonb NOT NULL,prompt text NOT NULL,system_prompt text NOT NULL,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN('queued','running','completed','failed','cancelled','uncertain')),
 attempt_id uuid,lease_until timestamptz,sequence integer NOT NULL DEFAULT 0,payload_hash text,
 result text,has_result boolean GENERATED ALWAYS AS(result IS NOT NULL) STORED,error text,created_at timestamptz NOT NULL DEFAULT now(),started_at timestamptz,finished_at timestamptz,
 UNIQUE(run_id,parent_attempt,step_idx),
 CHECK(octet_length(prompt)<=20000 AND octet_length(system_prompt)<=20000),
 CHECK(octet_length(result)<=524288),CHECK(sequence BETWEEN 0 AND 256),
CHECK(status<>'running' OR (attempt_id IS NOT NULL AND lease_until IS NOT NULL AND started_at IS NOT NULL))
);
ALTER TABLE public.personal_pipeline_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.personal_pipeline_jobs FROM anon,authenticated,service_role;
GRANT SELECT ON public.personal_pipeline_jobs TO service_role;
GRANT SELECT(id,run_id,workspace_id,parent_attempt,step_idx,agent_id,device_id,status,attempt_id,lease_until,created_at,started_at,finished_at,error,has_result,result) ON public.personal_pipeline_jobs TO authenticated;
CREATE POLICY personal_pipeline_jobs_read ON public.personal_pipeline_jobs FOR SELECT TO authenticated USING(public.is_workspace_member(workspace_id));
CREATE INDEX personal_pipeline_queue ON public.personal_pipeline_jobs(device_id,created_at) WHERE status='queued';

CREATE OR REPLACE FUNCTION public.lock_pipeline_attempt(p_run uuid,p_attempt uuid) RETURNS public.team_runs
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.team_runs; h jsonb:=current_setting('request.headers',true)::jsonb;
BEGIN
 PERFORM 1 FROM public.workspaces WHERE id=(SELECT workspace_id FROM public.team_runs WHERE id=p_run) FOR UPDATE;
 SELECT * INTO STRICT r FROM public.team_runs WHERE id=p_run FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM public.workspaces WHERE id=r.workspace_id AND suspended_at IS NULL) OR r.status<>'running' OR r.execution_attempt_id IS DISTINCT FROM p_attempt
  OR h->>'x-crewform-runner-id' IS DISTINCT FROM r.claimed_by_runner::text
  OR h->>'x-crewform-execution-job' IS DISTINCT FROM r.id::text
  OR h->>'x-crewform-execution-attempt' IS DISTINCT FROM p_attempt::text
  OR NOT EXISTS(SELECT 1 FROM public.task_runners WHERE id=r.claimed_by_runner AND status='active')
 THEN RAISE EXCEPTION 'Pipeline execution cancelled or attempt lost'; END IF;
 RETURN r;
END;
$$;


CREATE FUNCTION public.personal_pipeline_consent(q public.personal_pipeline_jobs) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.team_runs r JOIN public.pipeline_checkpoints c ON c.run_id=r.id
  JOIN public.personal_devices d ON d.id=q.device_id
  WHERE r.id=q.run_id AND r.workspace_id=q.workspace_id AND r.status='running' AND r.execution_attempt_id=q.parent_attempt
   AND c.attempt_id=q.parent_attempt AND c.in_flight=q.step_idx AND c.next_step=q.step_idx
   AND d.workspace_id=r.workspace_id AND d.user_id=r.created_by AND d.revoked_at IS NULL AND d.approved_until>now()
   AND q.agent_id=ANY(d.agent_ids) AND q.agent_snapshot->'config'->>'paired_device_id'=d.id::text
   AND (q.agent_snapshot->'config'->'execution'->>'agent')||':'||(q.agent_snapshot->'config'->'execution'->>'transport')=d.runtime
   AND EXISTS(SELECT 1 FROM public.task_runners WHERE id=r.claimed_by_runner AND status='active')
   AND EXISTS(SELECT 1 FROM public.workspaces WHERE id=r.workspace_id AND suspended_at IS NULL)
   AND public.verify_native_consent(r.workspace_id,r.created_by,NULL,r.id,q.agent_id,q.agent_snapshot));
$$;

CREATE FUNCTION public.queue_personal_pipeline_job(p_run uuid,p_attempt uuid,p_step integer,p_agent uuid,p_prompt text,p_system_prompt text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.team_runs;c public.pipeline_checkpoints;q public.personal_pipeline_jobs;a jsonb;v_device uuid;
BEGIN
 r:=public.lock_pipeline_attempt(p_run,p_attempt);
 SELECT * INTO STRICT c FROM public.pipeline_checkpoints WHERE run_id=p_run FOR UPDATE;
 IF c.attempt_id IS DISTINCT FROM p_attempt OR c.next_step<>p_step OR c.in_flight IS DISTINCT FROM p_step
  OR c.configuration IS DISTINCT FROM public.pipeline_configuration(p_run) THEN RAISE EXCEPTION 'Pipeline checkpoint is stale'; END IF;
 IF c.configuration->'team'->'config'->'steps'->p_step->>'agent_id' IS DISTINCT FROM p_agent::text
  OR c.configuration->'team'->'config'->'steps'->p_step->>'type'='fan_out' THEN RAISE EXCEPTION 'Personal pipeline jobs support sequential steps only'; END IF;
 a:=c.configuration->'agents'->p_agent::text;
 IF a->'config'->'execution'->>'kind' IS DISTINCT FROM 'external' OR a->'config'->>'paired_device_id' IS NULL THEN RAISE EXCEPTION 'No personal device selected'; END IF;
 v_device:=(a->'config'->>'paired_device_id')::uuid;
 -- Serialized with device claims by the workspace lock from lock_pipeline_attempt.
 PERFORM 1 FROM public.personal_devices WHERE id=v_device FOR UPDATE;
 INSERT INTO public.personal_pipeline_jobs(run_id,workspace_id,parent_attempt,step_idx,agent_id,device_id,agent_snapshot,prompt,system_prompt)
 VALUES(r.id,r.workspace_id,p_attempt,p_step,p_agent,v_device,a,p_prompt,p_system_prompt) ON CONFLICT DO NOTHING;
 SELECT * INTO STRICT q FROM public.personal_pipeline_jobs WHERE run_id=p_run AND parent_attempt=p_attempt AND step_idx=p_step FOR UPDATE;
 IF q.prompt IS DISTINCT FROM p_prompt OR q.system_prompt IS DISTINCT FROM p_system_prompt OR q.agent_id<>p_agent
  OR NOT public.personal_pipeline_consent(q) THEN RAISE EXCEPTION 'Personal pipeline consent or device grant changed'; END IF;
 RETURN q.id;
END;
$$;

-- All public device job entry points take the workspace lock before a device
-- lock. Parent workflow operations use the same order.
CREATE FUNCTION public.lock_personal_workspace(p_hash text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM 1 FROM public.workspaces WHERE id=(SELECT workspace_id FROM public.personal_devices WHERE credential_hash=p_hash) FOR UPDATE;
 -- One valid native lease per owner and agent family across transports,
 -- profiles and workspaces. Credentials remain private to each profile.
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('crewform-personal:'||user_id::text||':'||split_part(runtime,':',1),0))
  FROM public.personal_devices WHERE credential_hash=p_hash;
END;
$$;
ALTER FUNCTION public.claim_personal_job(text) RENAME TO claim_single_personal_job;
ALTER FUNCTION public.heartbeat_personal_job(text,uuid,uuid) RENAME TO heartbeat_single_personal_job;
ALTER FUNCTION public.write_personal_job(text,uuid,uuid,integer,text,text) RENAME TO write_single_personal_job;
ALTER FUNCTION public.personal_job_attachment(text,uuid,uuid,uuid) RENAME TO single_personal_job_attachment;
ALTER FUNCTION public.maintain_personal_jobs() RENAME TO maintain_single_personal_jobs;

CREATE FUNCTION public.personal_pipeline_authority(p_hash text,p_job uuid,p_attempt uuid) RETURNS public.personal_pipeline_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.personal_devices;q public.personal_pipeline_jobs;
BEGIN
 PERFORM public.lock_personal_workspace(p_hash);
 d:=public.personal_device_authority(p_hash);
 SELECT * INTO q FROM public.personal_pipeline_jobs WHERE id=p_job AND device_id=d.id AND workspace_id=d.workspace_id FOR UPDATE;
 IF NOT FOUND OR q.status<>'running' OR q.attempt_id IS DISTINCT FROM p_attempt OR q.lease_until<=now()
  OR NOT public.personal_pipeline_consent(q) THEN RAISE EXCEPTION 'Personal pipeline lease cancelled, expired or superseded'; END IF;
 RETURN q;
END;
$$;

CREATE FUNCTION public.claim_personal_job(p_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.personal_devices;q public.personal_pipeline_jobs;v_files jsonb;
BEGIN
 PERFORM public.lock_personal_workspace(p_hash);
 d:=public.personal_device_authority(p_hash);
 UPDATE public.personal_devices SET last_seen_at=now() WHERE id=d.id;
 IF EXISTS(SELECT 1 FROM public.personal_pipeline_jobs active_job JOIN public.personal_devices owner_device ON owner_device.id=active_job.device_id WHERE owner_device.user_id=d.user_id AND split_part(owner_device.runtime,':',1)=split_part(d.runtime,':',1) AND active_job.status='running')
  OR EXISTS(SELECT 1 FROM public.personal_worker_leases l JOIN public.personal_devices owner_device ON owner_device.id=l.device_id WHERE owner_device.user_id=d.user_id AND split_part(owner_device.runtime,':',1)=split_part(d.runtime,':',1) AND l.finished_at IS NULL) THEN RETURN NULL; END IF;
 SELECT * INTO q FROM public.personal_pipeline_jobs WHERE device_id=d.id AND status='queued' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN public.claim_single_personal_job(p_hash); END IF;
 IF NOT public.personal_pipeline_consent(q) THEN
  UPDATE public.personal_pipeline_jobs SET status='failed',error='Approved pipeline or device grant changed before dispatch.',finished_at=now() WHERE id=q.id;
  RETURN NULL;
 END IF;
 IF (SELECT count(*)>5 OR coalesce(sum(file_size),0)>20971520 OR coalesce(max(file_size),0)>10485760
  FROM public.file_attachments WHERE team_run_id=q.run_id AND workspace_id=q.workspace_id AND direction='input') THEN RAISE EXCEPTION 'Personal attachments exceed limit'; END IF;
 UPDATE public.personal_pipeline_jobs SET status='running',attempt_id=gen_random_uuid(),lease_until=now()+interval '15 seconds',started_at=now() WHERE id=q.id RETURNING * INTO q;
 UPDATE public.agents SET status='busy' WHERE id=q.agent_id AND workspace_id=q.workspace_id;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'size',file_size,'type',file_type) ORDER BY id),'[]'::jsonb) INTO v_files
  FROM public.file_attachments WHERE team_run_id=q.run_id AND workspace_id=q.workspace_id AND direction='input';
 RETURN jsonb_build_object('id',q.id,'attemptId',q.attempt_id,'runtime',d.runtime,'execution',q.agent_snapshot->'config'->'execution',
  'model',q.agent_snapshot->'model','systemPrompt',q.system_prompt,'prompt',q.prompt,'attachments',v_files,'leaseSeconds',15);
END;
$$;

CREATE FUNCTION public.heartbeat_personal_job(p_hash text,p_task uuid,p_attempt uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE q public.personal_pipeline_jobs;
BEGIN
 PERFORM public.lock_personal_workspace(p_hash);
 IF EXISTS(SELECT 1 FROM public.personal_pipeline_jobs WHERE id=p_task) THEN
  q:=public.personal_pipeline_authority(p_hash,p_task,p_attempt);
  UPDATE public.personal_pipeline_jobs SET lease_until=now()+interval '15 seconds' WHERE id=q.id;
  UPDATE public.personal_devices SET last_seen_at=now() WHERE id=q.device_id;
 ELSE PERFORM public.heartbeat_single_personal_job(p_hash,p_task,p_attempt); END IF;
END;
$$;

CREATE FUNCTION public.write_personal_job(p_hash text,p_task uuid,p_attempt uuid,p_sequence integer,p_text text,p_outcome text DEFAULT 'stream') RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE q public.personal_pipeline_jobs;d public.personal_devices;v_hash text;
BEGIN
 PERFORM public.lock_personal_workspace(p_hash);
 IF NOT EXISTS(SELECT 1 FROM public.personal_pipeline_jobs WHERE id=p_task) THEN
  PERFORM public.write_single_personal_job(p_hash,p_task,p_attempt,p_sequence,p_text,p_outcome); RETURN;
 END IF;
 IF p_outcome NOT IN('stream','completed','failed') OR p_text IS NULL OR octet_length(p_text)>524288 OR p_sequence NOT BETWEEN 1 AND 256 THEN RAISE EXCEPTION 'Personal result exceeds limits'; END IF;
 d:=public.personal_device_authority(p_hash);
 v_hash:=encode(extensions.digest(p_outcome||':'||p_text,'sha256'),'hex');
 SELECT * INTO q FROM public.personal_pipeline_jobs WHERE id=p_task AND device_id=d.id FOR UPDATE;
 IF q.attempt_id=p_attempt AND p_sequence=q.sequence AND v_hash=q.payload_hash AND p_outcome=q.status AND q.status IN('completed','failed') THEN RETURN; END IF;
 q:=public.personal_pipeline_authority(p_hash,p_task,p_attempt);
 IF p_outcome='stream' AND p_sequence=q.sequence AND v_hash=q.payload_hash THEN RETURN; END IF;
 IF p_sequence<>q.sequence+1 THEN RAISE EXCEPTION 'Personal result replay or sequence gap'; END IF;
 UPDATE public.personal_pipeline_jobs SET sequence=p_sequence,payload_hash=v_hash,
  result=CASE WHEN p_outcome IN('stream','completed') THEN p_text ELSE result END,
  status=CASE WHEN p_outcome='stream' THEN status ELSE p_outcome END,
  error=CASE WHEN p_outcome='failed' THEN 'Personal agent failed; review the local account or adapter. No API fallback was attempted.' END,
  finished_at=CASE WHEN p_outcome<>'stream' THEN now() END WHERE id=q.id;
 IF p_outcome<>'stream' THEN UPDATE public.agents SET status='idle' WHERE id=q.agent_id AND workspace_id=q.workspace_id; END IF;
END;
$$;

CREATE FUNCTION public.personal_job_attachment(p_hash text,p_task uuid,p_attempt uuid,p_file uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE q public.personal_pipeline_jobs;f public.file_attachments;
BEGIN
 PERFORM public.lock_personal_workspace(p_hash);
 IF NOT EXISTS(SELECT 1 FROM public.personal_pipeline_jobs WHERE id=p_task) THEN RETURN public.single_personal_job_attachment(p_hash,p_task,p_attempt,p_file); END IF;
 q:=public.personal_pipeline_authority(p_hash,p_task,p_attempt);
 SELECT * INTO f FROM public.file_attachments WHERE id=p_file AND team_run_id=q.run_id AND workspace_id=q.workspace_id AND direction='input';
 IF NOT FOUND OR f.file_size>10485760 THEN RAISE EXCEPTION 'Attachment unavailable'; END IF;
 RETURN jsonb_build_object('path',f.storage_path,'type',f.file_type,'size',f.file_size);
END;
$$;

CREATE FUNCTION public.maintain_personal_jobs() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM public.maintain_single_personal_jobs();
 WITH retired AS (UPDATE public.personal_pipeline_jobs q SET status=CASE WHEN q.status='running' THEN 'uncertain' ELSE 'failed' END,
  error='Personal device or pipeline authority expired; review before continuing.',finished_at=now()
 WHERE q.status IN('queued','running') AND
  ((q.status='running' AND q.lease_until<=now()) OR q.created_at<now()-interval '15 minutes' OR NOT public.personal_pipeline_consent(q)) RETURNING q.agent_id)
 UPDATE public.agents a SET status='idle' WHERE a.id IN(SELECT agent_id FROM retired)
  AND NOT EXISTS(SELECT 1 FROM public.personal_pipeline_jobs WHERE agent_id=a.id AND status='running')
  AND NOT EXISTS(SELECT 1 FROM public.tasks WHERE assigned_agent_id=a.id AND status IN('running','waiting_for_input'));
END;
$$;

CREATE FUNCTION public.read_personal_pipeline_job(p_run uuid,p_attempt uuid,p_job uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.team_runs;q public.personal_pipeline_jobs;
BEGIN
 r:=public.lock_pipeline_attempt(p_run,p_attempt);
 SELECT * INTO STRICT q FROM public.personal_pipeline_jobs WHERE id=p_job AND run_id=r.id AND parent_attempt=p_attempt FOR UPDATE;
 IF q.status IN('queued','running') AND ((q.status='running' AND q.lease_until<=now()) OR NOT public.personal_pipeline_consent(q)) THEN
  UPDATE public.personal_pipeline_jobs SET status=CASE WHEN status='running' THEN 'uncertain' ELSE 'failed' END,
   error='Personal device or pipeline authority lost. No API fallback was attempted.',finished_at=now() WHERE id=q.id RETURNING * INTO q;
  UPDATE public.agents SET status='idle' WHERE id=q.agent_id AND workspace_id=q.workspace_id;
 END IF;
 RETURN jsonb_build_object('status',q.status,'result',q.result,'error',q.error);
END;
$$;

CREATE FUNCTION public.cancel_personal_pipeline_job(p_run uuid,p_attempt uuid,p_step integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.team_runs;q public.personal_pipeline_jobs;h jsonb:=current_setting('request.headers',true)::jsonb;
BEGIN
 PERFORM 1 FROM public.workspaces WHERE id=(SELECT workspace_id FROM public.team_runs WHERE id=p_run) FOR UPDATE;
 SELECT * INTO STRICT r FROM public.team_runs WHERE id=p_run FOR UPDATE;
 IF r.execution_attempt_id IS DISTINCT FROM p_attempt OR h->>'x-crewform-execution-job' IS DISTINCT FROM r.id::text
  OR h->>'x-crewform-execution-attempt' IS DISTINCT FROM p_attempt::text THEN RAISE EXCEPTION 'Pipeline attempt superseded'; END IF;
 SELECT * INTO q FROM public.personal_pipeline_jobs WHERE run_id=r.id AND parent_attempt=p_attempt AND step_idx=p_step FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 IF q.status IN('queued','running') THEN UPDATE public.personal_pipeline_jobs SET status=CASE WHEN status='running' THEN 'uncertain' ELSE 'cancelled' END,
  error='Pipeline stopped; no automatic replay or API fallback.',finished_at=now() WHERE id=q.id;
  IF q.started_at IS NOT NULL THEN UPDATE public.agents SET status='idle' WHERE id=q.agent_id AND workspace_id=q.workspace_id; END IF; END IF;
 -- A job that was never claimed cannot have caused native effects. Clear only
 -- that boundary; an issued native lease always requires uncertainty review.
 IF q.started_at IS NULL THEN UPDATE public.pipeline_checkpoints SET in_flight=NULL,revision=revision+1,updated_at=now()
  WHERE run_id=r.id AND attempt_id=p_attempt AND in_flight=p_step AND next_step=p_step; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_single_personal_job(text),public.heartbeat_single_personal_job(text,uuid,uuid),public.write_single_personal_job(text,uuid,uuid,integer,text,text),public.single_personal_job_attachment(text,uuid,uuid,uuid),public.maintain_single_personal_jobs(),
 public.limit_personal_devices(),public.personal_pipeline_consent(public.personal_pipeline_jobs),public.lock_personal_workspace(text),public.personal_pipeline_authority(text,uuid,uuid),
 public.queue_personal_pipeline_job(uuid,uuid,integer,uuid,text,text),public.read_personal_pipeline_job(uuid,uuid,uuid),public.cancel_personal_pipeline_job(uuid,uuid,integer),
 public.claim_personal_job(text),public.heartbeat_personal_job(text,uuid,uuid),public.write_personal_job(text,uuid,uuid,integer,text,text),public.personal_job_attachment(text,uuid,uuid,uuid),public.maintain_personal_jobs()
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.queue_personal_pipeline_job(uuid,uuid,integer,uuid,text,text),public.read_personal_pipeline_job(uuid,uuid,uuid),public.cancel_personal_pipeline_job(uuid,uuid,integer),
 public.claim_personal_job(text),public.heartbeat_personal_job(text,uuid,uuid),public.write_personal_job(text,uuid,uuid,integer,text,text),public.personal_job_attachment(text,uuid,uuid,uuid),public.maintain_personal_jobs() TO service_role;
