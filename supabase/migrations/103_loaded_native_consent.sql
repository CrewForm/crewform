-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Bind the executed snapshot as well as current database configuration.
DROP FUNCTION public.verify_native_consent(uuid,uuid,uuid,uuid,uuid);
CREATE FUNCTION public.verify_native_consent(p_workspace_id uuid,p_user_id uuid,p_task_id uuid,p_team_run_id uuid,p_agent_id uuid,p_agent_snapshot jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_job jsonb;v_agent public.agents;v_consent jsonb;v_team jsonb;v_kind text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.workspaces WHERE id=p_workspace_id AND owner_id=p_user_id) AND NOT EXISTS(SELECT 1 FROM public.workspace_members WHERE workspace_id=p_workspace_id AND user_id=p_user_id) THEN RETURN false; END IF;
 IF (p_task_id IS NULL)=(p_team_run_id IS NULL) THEN RETURN false; END IF;
 IF p_task_id IS NOT NULL THEN SELECT to_jsonb(t) INTO v_job FROM public.tasks t WHERE t.id=p_task_id AND t.workspace_id=p_workspace_id;v_kind:='tasks';
 ELSE SELECT to_jsonb(t) INTO v_job FROM public.team_runs t WHERE t.id=p_team_run_id AND t.workspace_id=p_workspace_id;v_kind:='team_runs'; END IF;
 IF v_job->>'status'<>'running' OR v_job->>'actor_type'<>'user' OR v_job->>'created_by' IS DISTINCT FROM p_user_id::text THEN RETURN false; END IF;
 v_consent:=v_job->'native_consent';
 IF jsonb_typeof(p_agent_snapshot) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
 IF v_consent->'files' IS DISTINCT FROM public.native_input_files(p_workspace_id,p_task_id,p_team_run_id) THEN RETURN false; END IF;
 SELECT * INTO v_agent FROM public.agents WHERE id=p_agent_id AND workspace_id=p_workspace_id;
 IF NOT FOUND OR v_consent->'agents'->>p_agent_id::text IS DISTINCT FROM public.native_agent_digest(v_agent)
   OR v_consent->'input' IS DISTINCT FROM public.native_job_input(v_job,v_kind)
   OR (to_jsonb(v_agent)-'status'-'updated_at'-'created_at') IS DISTINCT FROM (to_jsonb(jsonb_populate_record(NULL::public.agents,p_agent_snapshot))-'status'-'updated_at'-'created_at') THEN RETURN false; END IF;
 IF v_kind='team_runs' THEN
  SELECT to_jsonb(t)-'updated_at'-'created_at' INTO v_team FROM public.teams t WHERE t.id=(v_job->>'team_id')::uuid AND t.workspace_id=p_workspace_id;
  IF v_consent->'team' IS DISTINCT FROM v_team THEN RETURN false; END IF;
 END IF;
 RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.verify_native_consent(uuid,uuid,uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.verify_native_consent(uuid,uuid,uuid,uuid,uuid,jsonb) TO service_role;
CREATE FUNCTION public.protect_active_native_configuration() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_agents uuid[];
BEGIN
 IF TG_TABLE_NAME='agents' THEN
  IF public.native_agent_digest(NEW::public.agents)=public.native_agent_digest(OLD::public.agents) THEN RETURN NEW; END IF;
 END IF;
 IF TG_TABLE_NAME<>'agents' AND (to_jsonb(NEW)-'created_at'-'updated_at')=(to_jsonb(OLD)-'created_at'-'updated_at') THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='agents' THEN v_agents:=ARRAY[OLD.id];
 ELSIF TG_TABLE_NAME IN('voice_profiles','output_templates') THEN
  SELECT array_agg(a.id) INTO v_agents FROM public.agents a WHERE a.workspace_id=OLD.workspace_id AND
   to_jsonb(a)->>CASE WHEN TG_TABLE_NAME='voice_profiles' THEN 'voice_profile_id' ELSE 'output_template_id' END=OLD.id::text;
 END IF;
 IF EXISTS(SELECT 1 FROM public.tasks t WHERE t.workspace_id=OLD.workspace_id AND t.status IN('dispatched','running','waiting_for_input') AND EXISTS(SELECT 1 FROM unnest(v_agents) id WHERE t.native_consent->'agents' ? id::text))
 OR EXISTS(SELECT 1 FROM public.team_runs r WHERE r.workspace_id=OLD.workspace_id AND r.status IN('pending','running','paused') AND r.native_consent IS NOT NULL AND
  ((TG_TABLE_NAME='teams' AND r.team_id=OLD.id) OR EXISTS(SELECT 1 FROM unnest(v_agents) id WHERE r.native_consent->'agents' ? id::text))) THEN RAISE EXCEPTION 'Cancel active native work before changing its approved configuration'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER active_native_configuration BEFORE UPDATE ON public.agents FOR EACH ROW EXECUTE FUNCTION public.protect_active_native_configuration();
CREATE TRIGGER active_native_configuration BEFORE UPDATE ON public.teams FOR EACH ROW EXECUTE FUNCTION public.protect_active_native_configuration();
CREATE TRIGGER active_native_configuration BEFORE UPDATE ON public.voice_profiles FOR EACH ROW EXECUTE FUNCTION public.protect_active_native_configuration();
CREATE TRIGGER active_native_configuration BEFORE UPDATE ON public.output_templates FOR EACH ROW EXECUTE FUNCTION public.protect_active_native_configuration();
REVOKE ALL ON FUNCTION public.protect_active_native_configuration() FROM PUBLIC,anon,authenticated;
