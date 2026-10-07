-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Creator identity alone is insufficient when collaborative configuration can change.
ALTER TABLE public.tasks ADD COLUMN native_consent jsonb;
ALTER TABLE public.team_runs ADD COLUMN native_consent jsonb;
CREATE FUNCTION public.native_agent_digest(p_agent public.agents) RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT encode(extensions.digest((to_jsonb(p_agent)-'status'-'updated_at'-'created_at')::text,'sha256'),'hex');
$$;
CREATE FUNCTION public.native_job_input(p_job jsonb,p_kind text) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN p_kind='tasks' THEN jsonb_build_object('title',p_job->'title','description',p_job->'description','agent',p_job->'assigned_agent_id','team',p_job->'assigned_team_id','model_override',p_job->'metadata'->'model_override')
 ELSE jsonb_build_object('input',p_job->'input_task','team',p_job->'team_id') END;
$$;
CREATE FUNCTION public.native_input_files(p_workspace_id uuid,p_task_id uuid,p_team_run_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('attachment',to_jsonb(f),'object_version',o.updated_at,'storage_version',o.version,'object_id',o.id) ORDER BY f.id),'[]'::jsonb)
 FROM public.file_attachments f LEFT JOIN storage.objects o ON o.bucket_id='attachments' AND o.name=f.storage_path
 WHERE f.workspace_id=p_workspace_id AND f.direction='input' AND
 ((p_task_id IS NOT NULL AND f.task_id=p_task_id) OR (p_team_run_id IS NOT NULL AND f.team_run_id=p_team_run_id));
$$;
CREATE FUNCTION public.capture_native_consent() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_grants jsonb;v_team jsonb;v_agent uuid;
BEGIN
 IF auth.role()='authenticated' AND NEW.created_by=auth.uid() AND NEW.status IN('pending','dispatched') THEN
  IF TG_TABLE_NAME='tasks' THEN
   v_agent:=NEW.assigned_agent_id;
   SELECT jsonb_object_agg(a.id,public.native_agent_digest(a)) INTO v_grants FROM public.agents a WHERE a.workspace_id=NEW.workspace_id AND a.id=v_agent AND a.config->'execution'->>'kind'='external';
  ELSE
   SELECT to_jsonb(t)-'updated_at'-'created_at' INTO v_team FROM public.teams t WHERE t.id=NEW.team_id AND t.workspace_id=NEW.workspace_id;
   SELECT jsonb_object_agg(a.id,public.native_agent_digest(a)) INTO v_grants FROM public.agents a WHERE a.workspace_id=NEW.workspace_id AND a.config->'execution'->>'kind'='external'
    AND (v_team::text LIKE '%'||a.id::text||'%' OR EXISTS(SELECT 1 FROM public.team_members m WHERE m.team_id=NEW.team_id AND m.agent_id=a.id));
  END IF;
  NEW.native_consent:=CASE WHEN v_grants IS NULL THEN NULL ELSE jsonb_build_object('agents',v_grants,'input',public.native_job_input(to_jsonb(NEW),TG_TABLE_NAME),'team',v_team,'files',public.native_input_files(NEW.workspace_id,CASE WHEN TG_TABLE_NAME='tasks' THEN NEW.id END,CASE WHEN TG_TABLE_NAME='team_runs' THEN NEW.id END)) END;
 ELSIF TG_OP='INSERT' THEN NEW.native_consent:=NULL;
 ELSIF NEW.native_consent IS DISTINCT FROM OLD.native_consent THEN RAISE EXCEPTION 'Native execution consent is server-owned';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER a_native_consent BEFORE INSERT OR UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.capture_native_consent();
CREATE TRIGGER a_native_consent BEFORE INSERT OR UPDATE ON public.team_runs FOR EACH ROW EXECUTE FUNCTION public.capture_native_consent();
CREATE FUNCTION public.verify_native_consent(p_workspace_id uuid,p_user_id uuid,p_task_id uuid,p_team_run_id uuid,p_agent_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_job jsonb;v_agent public.agents;v_consent jsonb;v_team jsonb;v_kind text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.workspaces WHERE id=p_workspace_id AND owner_id=p_user_id) AND NOT EXISTS(SELECT 1 FROM public.workspace_members WHERE workspace_id=p_workspace_id AND user_id=p_user_id) THEN RETURN false; END IF;
 IF (p_task_id IS NULL)=(p_team_run_id IS NULL) THEN RETURN false; END IF;
 IF p_task_id IS NOT NULL THEN SELECT to_jsonb(t) INTO v_job FROM public.tasks t WHERE t.id=p_task_id AND t.workspace_id=p_workspace_id;v_kind:='tasks';
 ELSE SELECT to_jsonb(t) INTO v_job FROM public.team_runs t WHERE t.id=p_team_run_id AND t.workspace_id=p_workspace_id;v_kind:='team_runs'; END IF;
 IF v_job->>'status'<>'running' OR v_job->>'actor_type'<>'user' OR v_job->>'created_by' IS DISTINCT FROM p_user_id::text THEN RETURN false; END IF;
 v_consent:=v_job->'native_consent';
 IF v_consent->'files' IS DISTINCT FROM public.native_input_files(p_workspace_id,p_task_id,p_team_run_id) THEN RETURN false; END IF;
 SELECT * INTO v_agent FROM public.agents WHERE id=p_agent_id AND workspace_id=p_workspace_id;
 IF NOT FOUND OR v_consent->'agents'->>p_agent_id::text IS DISTINCT FROM public.native_agent_digest(v_agent)
   OR v_consent->'input' IS DISTINCT FROM public.native_job_input(v_job,v_kind) THEN RETURN false; END IF;
 IF v_kind='team_runs' THEN
  SELECT to_jsonb(t)-'updated_at'-'created_at' INTO v_team FROM public.teams t WHERE t.id=(v_job->>'team_id')::uuid AND t.workspace_id=p_workspace_id;
  IF v_consent->'team' IS DISTINCT FROM v_team THEN RETURN false; END IF;
 END IF;
 RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.native_input_files(uuid,uuid,uuid),public.native_agent_digest(public.agents),public.native_job_input(jsonb,text),public.capture_native_consent(),public.verify_native_consent(uuid,uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.verify_native_consent(uuid,uuid,uuid,uuid,uuid) TO service_role;
