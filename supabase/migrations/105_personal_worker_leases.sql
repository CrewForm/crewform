-- SPDX-License-Identifier: AGPL-3.0-or-later
ALTER TABLE public.tasks ADD COLUMN execution_device_id uuid REFERENCES public.personal_devices(id) ON DELETE SET NULL;
ALTER TABLE public.personal_devices ADD COLUMN active_task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL;
GRANT SELECT(active_task_id) ON public.personal_devices TO authenticated;
-- Retire the historical overload; all supported runners supply p_runner_id.
DROP FUNCTION IF EXISTS public.claim_next_task();
CREATE INDEX personal_device_queue ON public.tasks(execution_device_id,created_at) WHERE status='dispatched';
CREATE TABLE public.personal_worker_leases (
 task_id uuid PRIMARY KEY REFERENCES public.tasks(id) ON DELETE CASCADE,
 device_id uuid NOT NULL REFERENCES public.personal_devices(id) ON DELETE CASCADE, attempt_id uuid NOT NULL,
 expires_at timestamptz NOT NULL, sequence integer NOT NULL DEFAULT 0, payload_hash text,
 started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz
);
ALTER TABLE public.personal_worker_leases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.personal_worker_leases FROM anon,authenticated;
GRANT ALL ON public.personal_worker_leases TO service_role;

-- Account deletion retires work before FK nulling, never moving it to the API queue.
CREATE FUNCTION public.retire_personal_device() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE public.tasks SET status='failed',error='Personal account deleted; prior effects are uncertain. No API fallback was attempted.' WHERE execution_device_id=OLD.id AND status IN('pending','dispatched','running','waiting_for_input');
 RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.retire_personal_device() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER retire_personal_device BEFORE DELETE ON public.personal_devices FOR EACH ROW EXECUTE FUNCTION public.retire_personal_device();

CREATE FUNCTION public.personal_device_authority(p_hash text) RETURNS public.personal_devices
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.personal_devices;
BEGIN
 SELECT * INTO d FROM public.personal_devices WHERE credential_hash=p_hash AND revoked_at IS NULL AND approved_until>now() FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.workspaces w WHERE w.id=d.workspace_id AND w.suspended_at IS NULL AND (w.owner_id=d.user_id OR EXISTS(SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=w.id AND m.user_id=d.user_id))) THEN RAISE EXCEPTION 'Device authority expired or revoked'; END IF;
 RETURN d;
END;
$$;

CREATE FUNCTION public.route_personal_task() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_device uuid;d public.personal_devices;a public.agents;
BEGIN
 IF TG_OP='UPDATE' AND NEW.execution_device_id IS DISTINCT FROM OLD.execution_device_id AND NOT (pg_trigger_depth()>1 AND NEW.execution_device_id IS NULL AND OLD.execution_device_id IS NOT NULL AND NEW.status IN('failed','completed','cancelled')) THEN RAISE EXCEPTION 'Device assignment is server-owned'; END IF;
 IF TG_OP='INSERT' THEN NEW.execution_device_id:=NULL; END IF;
 IF NEW.status='dispatched' AND (TG_OP='INSERT' OR OLD.status='pending') THEN
  SELECT * INTO a FROM public.agents WHERE id=NEW.assigned_agent_id AND workspace_id=NEW.workspace_id;
  IF a.config->'execution'->>'kind'='external' AND a.config->>'paired_device_id' IS NOT NULL THEN
   BEGIN v_device:=(a.config->>'paired_device_id')::uuid; EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'Invalid paired device'; END;
   SELECT * INTO d FROM public.personal_devices WHERE id=v_device AND user_id=NEW.created_by AND workspace_id=NEW.workspace_id AND revoked_at IS NULL AND approved_until>now();
   IF NOT FOUND OR auth.role()<>'authenticated' OR auth.uid() IS DISTINCT FROM d.user_id OR NEW.actor_type<>'user' OR NOT a.id=ANY(d.agent_ids) OR (a.config->'execution'->>'agent')||':'||(a.config->'execution'->>'transport') IS DISTINCT FROM d.runtime THEN RAISE EXCEPTION 'Personal device is not granted to this initiating user and agent'; END IF;
   IF NEW.assigned_team_id IS NOT NULL OR NEW.metadata->>'source'='chat-widget' OR NEW.metadata->>'model_override' IS NOT NULL THEN RAISE EXCEPTION 'Personal devices support own single-agent jobs only'; END IF;
   NEW.execution_device_id:=d.id;
  END IF;
 END IF;
 IF NEW.execution_device_id IS NOT NULL AND NEW.status='running' AND (TG_OP='INSERT' OR OLD.status NOT IN('running','waiting_for_input')) AND (auth.role()<>'service_role' OR current_setting('crewform.device_write',true) IS DISTINCT FROM NEW.execution_device_id::text) THEN RAISE EXCEPTION 'Only the assigned personal device may claim this task'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER z_personal_task BEFORE INSERT OR UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.route_personal_task();

CREATE FUNCTION public.maintain_personal_jobs() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE public.tasks t SET status='failed',error='Personal worker lease expired or authority revoked; prior effects are uncertain. Review before creating a new run.'
 FROM public.personal_worker_leases l,public.personal_devices d
 WHERE t.id=l.task_id AND l.device_id=d.id AND t.status='running' AND
 (l.expires_at<=now() OR d.revoked_at IS NOT NULL OR d.approved_until<=now() OR NOT EXISTS(SELECT 1 FROM public.workspaces w WHERE w.id=d.workspace_id AND w.suspended_at IS NULL AND (w.owner_id=d.user_id OR EXISTS(SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=w.id AND m.user_id=d.user_id))));
 UPDATE public.agents a SET status='idle' WHERE a.status='busy' AND EXISTS(SELECT 1 FROM public.tasks t JOIN public.personal_worker_leases l ON l.task_id=t.id WHERE t.assigned_agent_id=a.id AND t.status IN('failed','completed','cancelled') AND l.finished_at IS NULL) AND NOT EXISTS(SELECT 1 FROM public.tasks t WHERE t.assigned_agent_id=a.id AND t.status IN('running','waiting_for_input'));
 UPDATE public.personal_devices d SET active_task_id=NULL WHERE active_task_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.tasks t WHERE t.id=d.active_task_id AND t.status='running');
 UPDATE public.personal_worker_leases l SET finished_at=now() FROM public.tasks t WHERE t.id=l.task_id AND t.status IN('failed','completed','cancelled') AND l.finished_at IS NULL;
 UPDATE public.tasks t SET status='failed',error='Personal device was offline, revoked or unavailable. No API fallback was attempted.'
 FROM public.personal_devices d WHERE t.execution_device_id=d.id AND t.status='dispatched' AND (t.updated_at<now()-interval '15 minutes' OR d.revoked_at IS NOT NULL OR d.approved_until<=now());
 DELETE FROM public.device_pairings WHERE expires_at<now()-interval '1 day';
 DELETE FROM public.device_pairing_budgets WHERE window_at<now()-interval '1 day';
END;
$$;

CREATE FUNCTION public.claim_personal_job(p_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.personal_devices;t public.tasks;a public.agents;v_files jsonb;
BEGIN
 d:=public.personal_device_authority(p_hash);
 PERFORM 1 FROM public.personal_devices WHERE id=d.id FOR UPDATE;
 PERFORM 1 FROM public.workspaces WHERE id=d.workspace_id FOR UPDATE;
 UPDATE public.personal_devices SET last_seen_at=now() WHERE id=d.id;
 IF EXISTS(SELECT 1 FROM public.personal_worker_leases WHERE device_id=d.id AND finished_at IS NULL) THEN RETURN NULL; END IF;
 IF NOT public.workspace_has_execution_capacity(d.workspace_id) THEN RETURN NULL; END IF;
 SELECT * INTO t FROM public.tasks WHERE execution_device_id=d.id AND created_by=d.user_id AND actor_type='user' AND status='dispatched' AND updated_at>now()-interval '15 minutes' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO a FROM public.agents WHERE id=t.assigned_agent_id AND workspace_id=d.workspace_id;
 IF NOT FOUND OR NOT a.id=ANY(d.agent_ids) OR (a.config->'execution'->>'agent')||':'||(a.config->'execution'->>'transport') IS DISTINCT FROM d.runtime THEN RAISE EXCEPTION 'Agent grant changed'; END IF;
 IF (SELECT count(*)>5 OR coalesce(sum(file_size),0)>20971520 OR coalesce(max(file_size),0)>10485760 FROM public.file_attachments WHERE task_id=t.id AND workspace_id=d.workspace_id AND direction='input') THEN RAISE EXCEPTION 'Personal attachments exceed limit'; END IF;
 IF octet_length(coalesce(t.description,''))>20000 OR octet_length(t.title)>1000 OR octet_length(coalesce(a.system_prompt,''))>20000 THEN RAISE EXCEPTION 'Personal job input exceeds limit'; END IF;
 PERFORM set_config('crewform.device_write',d.id::text,true);
 UPDATE public.tasks SET status='running',claimed_by_runner=NULL,updated_at=now() WHERE id=t.id RETURNING * INTO t;
 IF NOT public.verify_native_consent(d.workspace_id,d.user_id,t.id,NULL,a.id,to_jsonb(a)) THEN RAISE EXCEPTION 'Native consent changed; review and dispatch again'; END IF;
 INSERT INTO public.personal_worker_leases(task_id,device_id,attempt_id,expires_at) VALUES(t.id,d.id,t.execution_attempt_id,now()+interval '15 seconds');
 UPDATE public.agents SET status='busy' WHERE id=a.id;
 UPDATE public.personal_devices SET active_task_id=t.id WHERE id=d.id;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'size',file_size,'type',file_type) ORDER BY id),'[]'::jsonb) INTO v_files FROM public.file_attachments WHERE task_id=t.id AND workspace_id=d.workspace_id AND direction='input';
 RETURN jsonb_build_object('id',t.id,'attemptId',t.execution_attempt_id,'runtime',d.runtime,'execution',a.config->'execution','model',a.model,'systemPrompt',coalesce(a.system_prompt,''),'prompt','Task Title: '||t.title||E'\n\nTask Description:\n'||coalesce(t.description,''),'attachments',v_files,'leaseSeconds',15);
END;
$$;

CREATE FUNCTION public.personal_job_authority(p_hash text,p_task uuid,p_attempt uuid) RETURNS public.tasks
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.personal_devices;t public.tasks;a public.agents;l public.personal_worker_leases;
BEGIN
 d:=public.personal_device_authority(p_hash);
 SELECT * INTO t FROM public.tasks WHERE id=p_task AND workspace_id=d.workspace_id AND execution_device_id=d.id AND created_by=d.user_id AND actor_type='user' FOR UPDATE;
 IF NOT FOUND OR t.status<>'running' OR t.execution_attempt_id IS DISTINCT FROM p_attempt THEN RAISE EXCEPTION 'Personal attempt cancelled or superseded'; END IF;
 SELECT * INTO l FROM public.personal_worker_leases WHERE task_id=t.id AND device_id=d.id AND attempt_id=p_attempt AND expires_at>now() AND finished_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Personal lease expired'; END IF;
 SELECT * INTO a FROM public.agents WHERE id=t.assigned_agent_id AND workspace_id=d.workspace_id;
 IF NOT FOUND OR NOT a.id=ANY(d.agent_ids) OR (a.config->'execution'->>'agent')||':'||(a.config->'execution'->>'transport') IS DISTINCT FROM d.runtime OR NOT public.verify_native_consent(d.workspace_id,d.user_id,t.id,NULL,a.id,to_jsonb(a)) THEN RAISE EXCEPTION 'Personal job consent changed'; END IF;
 RETURN t;
END;
$$;

CREATE FUNCTION public.heartbeat_personal_job(p_hash text,p_task uuid,p_attempt uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.tasks;
BEGIN
 t:=public.personal_job_authority(p_hash,p_task,p_attempt);
 UPDATE public.personal_worker_leases SET expires_at=now()+interval '15 seconds' WHERE task_id=t.id;
 UPDATE public.personal_devices SET last_seen_at=now() WHERE id=t.execution_device_id;
END;
$$;

CREATE FUNCTION public.write_personal_job(p_hash text,p_task uuid,p_attempt uuid,p_sequence integer,p_text text,p_outcome text DEFAULT 'stream') RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.tasks;l public.personal_worker_leases;v_hash text;d public.personal_devices;
BEGIN
 IF p_outcome NOT IN('stream','completed','failed') OR p_text IS NULL OR octet_length(p_text)>524288 OR p_sequence NOT BETWEEN 1 AND 256 THEN RAISE EXCEPTION 'Personal result exceeds limits'; END IF;
 v_hash:=encode(extensions.digest(p_outcome||':'||p_text,'sha256'),'hex');
 d:=public.personal_device_authority(p_hash);
 SELECT * INTO l FROM public.personal_worker_leases WHERE task_id=p_task AND device_id=d.id AND attempt_id=p_attempt;
 IF p_sequence=l.sequence AND v_hash=l.payload_hash AND p_outcome<>'stream' AND l.finished_at IS NOT NULL AND EXISTS(SELECT 1 FROM public.tasks WHERE id=p_task AND status=p_outcome AND execution_attempt_id=p_attempt) THEN RETURN; END IF;
 t:=public.personal_job_authority(p_hash,p_task,p_attempt);
 SELECT * INTO l FROM public.personal_worker_leases WHERE task_id=t.id;
 IF p_outcome='stream' AND p_sequence=l.sequence AND v_hash=l.payload_hash THEN RETURN; END IF;
 IF p_sequence<>l.sequence+1 THEN RAISE EXCEPTION 'Personal result replay or sequence gap'; END IF;
 UPDATE public.personal_worker_leases SET sequence=p_sequence,payload_hash=v_hash,finished_at=CASE WHEN p_outcome<>'stream' THEN now() END WHERE task_id=t.id;
 IF p_outcome='stream' THEN UPDATE public.tasks SET result=to_jsonb(p_text) WHERE id=t.id;
 ELSE
  UPDATE public.tasks SET status=p_outcome,result=CASE WHEN p_outcome='completed' THEN to_jsonb(p_text) ELSE result END,
   error=CASE WHEN p_outcome='failed' THEN 'Personal agent failed. Check the local account, adapter or quota; no API fallback was attempted.' END,
   metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('execution',jsonb_build_object('authentication','native-login','usageKnown',false,'billingModel','unknown','deviceId',execution_device_id,'attemptId',p_attempt)) WHERE id=t.id;
  UPDATE public.agent_tasks SET status=p_outcome,result=CASE WHEN p_outcome='completed' THEN to_jsonb(p_text) ELSE result END,completed_at=now() WHERE task_id=t.id AND status IN('pending','running');
  UPDATE public.agents SET status='idle' WHERE id=t.assigned_agent_id;
  UPDATE public.personal_devices SET active_task_id=NULL WHERE id=d.id;
 END IF;
END;
$$;

CREATE FUNCTION public.personal_job_attachment(p_hash text,p_task uuid,p_attempt uuid,p_file uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.tasks;f public.file_attachments;
BEGIN
 t:=public.personal_job_authority(p_hash,p_task,p_attempt);
 SELECT * INTO f FROM public.file_attachments WHERE id=p_file AND task_id=t.id AND workspace_id=t.workspace_id AND direction='input';
 IF NOT FOUND OR f.file_size>10485760 THEN RAISE EXCEPTION 'Attachment unavailable'; END IF;
 RETURN jsonb_build_object('path',f.storage_path,'type',f.file_type,'size',f.file_size);
END;
$$;

CREATE FUNCTION public.personal_device_status(p_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.personal_devices;
BEGIN
 d:=public.personal_device_authority(p_hash);
 RETURN jsonb_build_object('deviceId',d.id,'expiresAt',d.approved_until);
END;
$$;

CREATE FUNCTION public.rotate_personal_credential(p_hash text,p_new_hash text,p_revoke boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.personal_devices;
BEGIN
 d:=public.personal_device_authority(p_hash);
 IF p_new_hash !~ '^[a-f0-9]{64}$' AND NOT p_revoke THEN RAISE EXCEPTION 'Invalid credential'; END IF;
 UPDATE public.personal_devices SET credential_hash=CASE WHEN p_revoke THEN NULL ELSE p_new_hash END,revoked_at=CASE WHEN p_revoke THEN now() END WHERE id=d.id;
END;
$$;

REVOKE ALL ON FUNCTION public.personal_device_status(text),public.personal_device_authority(text),public.route_personal_task(),public.maintain_personal_jobs(),public.claim_personal_job(text),public.personal_job_authority(text,uuid,uuid),public.heartbeat_personal_job(text,uuid,uuid),public.write_personal_job(text,uuid,uuid,integer,text,text),public.personal_job_attachment(text,uuid,uuid,uuid),public.rotate_personal_credential(text,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.personal_device_status(text),public.maintain_personal_jobs(),public.claim_personal_job(text),public.heartbeat_personal_job(text,uuid,uuid),public.write_personal_job(text,uuid,uuid,integer,text,text),public.personal_job_attachment(text,uuid,uuid,uuid),public.rotate_personal_credential(text,text,boolean) TO service_role;
DO $$ BEGIN IF to_regnamespace('cron') IS NOT NULL THEN PERFORM cron.schedule('personal-worker-maintenance','* * * * *','SELECT public.maintain_personal_jobs()'); END IF; END $$;

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
     AND t.execution_device_id IS NULL
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

-- Laptop execution must not be counted as managed compute time.
ALTER TABLE public.execution_attempts DROP CONSTRAINT execution_attempts_backend_check;
ALTER TABLE public.execution_attempts ADD CONSTRAINT execution_attempts_backend_check CHECK(backend IN('managed','self_hosted','personal'));
CREATE OR REPLACE FUNCTION public.track_execution_runtime() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.status='running' THEN
  INSERT INTO public.execution_attempts(job_kind,job_id,workspace_id,runner_id,backend)
  VALUES(TG_TABLE_NAME,NEW.id,NEW.workspace_id,NEW.claimed_by_runner,CASE WHEN to_jsonb(NEW)->>'execution_device_id' IS NOT NULL THEN 'personal' WHEN (SELECT hosted FROM public.deployment_policy WHERE singleton) THEN 'managed' ELSE 'self_hosted' END) ON CONFLICT DO NOTHING;
 ELSIF NEW.status IN('completed','failed','cancelled','dispatched','pending') THEN
  UPDATE public.execution_attempts SET finished_at=now(),terminal_status=NEW.status WHERE job_kind=TG_TABLE_NAME AND job_id=NEW.id AND finished_at IS NULL;
 END IF;
 RETURN NEW;
END;
$$;
