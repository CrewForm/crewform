-- SPDX-License-Identifier: MIT
-- Demo tags and mutable workspace settings are presentation, not deletion authority.
CREATE TABLE public.workspace_demo_seeds (
 workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
 seed_id uuid NOT NULL DEFAULT gen_random_uuid(),team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
 agent_ids uuid[] NOT NULL CHECK(cardinality(agent_ids)=3),agent_digests jsonb NOT NULL,team_digest text NOT NULL
);
ALTER TABLE public.workspace_demo_seeds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.workspace_demo_seeds FROM anon,authenticated,service_role;
GRANT SELECT ON public.workspace_demo_seeds TO authenticated,service_role;
CREATE POLICY workspace_demo_read ON public.workspace_demo_seeds FOR SELECT TO authenticated USING(public.is_workspace_member(workspace_id));

CREATE FUNCTION public.get_demo_workspace(p_workspace_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.workspace_demo_seeds;
BEGIN
 IF NOT public.is_workspace_member(p_workspace_id) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 SELECT * INTO m FROM public.workspace_demo_seeds WHERE workspace_id=p_workspace_id;
 IF NOT FOUND THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('seed_id',m.seed_id,
  'team',(SELECT jsonb_build_object('id',t.id,'name',t.name) FROM public.teams t WHERE t.id=m.team_id AND t.workspace_id=p_workspace_id),
  'agents',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'name',a.name) ORDER BY a.name),'[]'::jsonb)
   FROM public.agents a WHERE a.id=ANY(m.agent_ids) AND a.workspace_id=p_workspace_id));
END;
$$;

CREATE FUNCTION public.seed_demo_workspace(p_workspace_id uuid,p_agents jsonb,p_steps jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w public.workspaces;d jsonb;s jsonb;a public.agents;t public.teams;ids uuid[]:='{}';lookup jsonb:='{}';steps jsonb:='[]';digests jsonb:='{}';v_seed uuid:=gen_random_uuid();v_idx integer:=0;
BEGIN
 IF coalesce(public.get_workspace_role(p_workspace_id),'') NOT IN('owner','admin','member') OR auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authorized to create a demo'; END IF;
 SELECT * INTO STRICT w FROM public.workspaces WHERE id=p_workspace_id FOR UPDATE;
 IF w.suspended_at IS NOT NULL THEN RAISE EXCEPTION 'Workspace is suspended'; END IF;
 IF EXISTS(SELECT 1 FROM public.workspace_demo_seeds WHERE workspace_id=w.id) OR w.settings->>'demo_seeded'='true' THEN RAISE EXCEPTION 'Demo already exists; review its existing resources first'; END IF;
 IF jsonb_typeof(p_agents) IS DISTINCT FROM 'array' OR jsonb_array_length(p_agents)<>3 OR octet_length(p_agents::text)>65536
  OR jsonb_typeof(p_steps) IS DISTINCT FROM 'array' OR jsonb_array_length(p_steps)<>3 OR octet_length(p_steps::text)>32768 THEN RAISE EXCEPTION 'Demo requires three bounded agents and steps'; END IF;
 FOR d IN SELECT value FROM jsonb_array_elements(p_agents) LOOP
  IF jsonb_typeof(d->'name') IS DISTINCT FROM 'string' OR d->>'name' NOT IN('Research Analyst','Content Writer','Data Analyst') OR lookup ? (d->>'name')
   OR jsonb_typeof(d->'system_prompt') IS DISTINCT FROM 'string' OR length(d->>'system_prompt')>16000
   OR length(coalesce(d->>'description',''))>2000 OR coalesce((d->>'temperature')::numeric,0.5) NOT BETWEEN 0 AND 2 THEN RAISE EXCEPTION 'Invalid demo agent'; END IF;
  INSERT INTO public.agents(workspace_id,name,description,model,provider,system_prompt,temperature,max_tokens,tags,tools,config)
  VALUES(w.id,d->>'name',coalesce(d->>'description',''),'gpt-4o-mini','openai',d->>'system_prompt',coalesce((d->>'temperature')::numeric,0.5),NULL,
   ARRAY['demo']::text[],'[]'::jsonb,jsonb_build_object('demo_seed_id',v_seed)) RETURNING * INTO a;
  ids:=array_append(ids,a.id);lookup:=lookup||jsonb_build_object(a.name,a.id);digests:=digests||jsonb_build_object(a.id,public.native_agent_digest(a));
 END LOOP;
 FOR s IN SELECT value FROM jsonb_array_elements(p_steps) LOOP
  IF jsonb_typeof(s->'agent_name') IS DISTINCT FROM 'string' OR NOT lookup ? (s->>'agent_name') OR jsonb_typeof(s->'step_name') IS DISTINCT FROM 'string' OR length(s->>'step_name') NOT BETWEEN 1 AND 100
   OR jsonb_typeof(s->'instructions') IS DISTINCT FROM 'string' OR length(s->>'instructions')>5000
   OR jsonb_typeof(s->'expected_output') IS DISTINCT FROM 'string' OR length(s->>'expected_output')>2000
   OR coalesce(s->>'on_failure','') NOT IN('retry','stop') OR coalesce((s->>'max_retries')::integer,0) NOT BETWEEN 0 AND 5 THEN RAISE EXCEPTION 'Invalid demo pipeline step'; END IF;
  steps:=steps||jsonb_build_array(jsonb_build_object('agent_id',lookup->(s->>'agent_name'),'step_name',s->>'step_name',
   'instructions',s->>'instructions','expected_output',s->>'expected_output','on_failure',s->>'on_failure','max_retries',coalesce((s->>'max_retries')::integer,0)));
 END LOOP;
 INSERT INTO public.teams(workspace_id,name,description,mode,config)
 VALUES(w.id,'Research Brief Pipeline','Source-grounded demo: Extract → Analyze → Write Brief. Uses supplied evidence and explicit unknowns.','pipeline',jsonb_build_object('steps',steps,'auto_handoff',true)) RETURNING * INTO t;
 FOR s IN SELECT value FROM jsonb_array_elements(steps) LOOP
  INSERT INTO public.team_members(team_id,agent_id,role,position) VALUES(t.id,(s->>'agent_id')::uuid,'worker',v_idx);
  v_idx:=v_idx+1;
 END LOOP;
 INSERT INTO public.workspace_demo_seeds(workspace_id,seed_id,team_id,agent_ids,agent_digests,team_digest)
 VALUES(w.id,v_seed,t.id,ids,digests,encode(extensions.digest((to_jsonb(t)-'updated_at'-'created_at')::text,'sha256'),'hex'));
 UPDATE public.workspaces SET settings=coalesce(settings,'{}'::jsonb)||jsonb_build_object('demo_seeded',true,'demo_team_id',t.id) WHERE id=w.id;
 RETURN jsonb_build_object('agents',(SELECT jsonb_agg(to_jsonb(g)) FROM public.agents g WHERE g.id=ANY(ids)),'team',to_jsonb(t));
END;
$$;

CREATE FUNCTION public.remove_demo_workspace(p_workspace_id uuid,p_seed_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.workspace_demo_seeds;
BEGIN
 IF coalesce(public.get_workspace_role(p_workspace_id),'') NOT IN('owner','admin','member') OR auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authorized to remove a demo'; END IF;
 PERFORM 1 FROM public.workspaces WHERE id=p_workspace_id FOR UPDATE;
 SELECT * INTO m FROM public.workspace_demo_seeds WHERE workspace_id=p_workspace_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Legacy or missing demo: review and remove its agents/team individually; no data was deleted'; END IF;
 IF m.seed_id IS DISTINCT FROM p_seed_id THEN RAISE EXCEPTION 'Demo selection changed; review the current resources before removing'; END IF;
 -- Hold the rows through the checks and deletion so an edit or FK reference
 -- cannot arrive between validation and cleanup.
 PERFORM 1 FROM public.agents WHERE id=ANY(m.agent_ids) AND workspace_id=p_workspace_id ORDER BY id FOR UPDATE;
 PERFORM 1 FROM public.teams WHERE id=m.team_id AND workspace_id=p_workspace_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.team_runs WHERE team_id=m.team_id AND status IN('pending','running','paused')) THEN RAISE EXCEPTION 'Cancel active demo runs before removing their resources'; END IF;
 IF EXISTS(SELECT 1 FROM public.agents a WHERE a.workspace_id=p_workspace_id AND a.id=ANY(m.agent_ids) AND m.agent_digests->>a.id::text IS DISTINCT FROM public.native_agent_digest(a))
  OR EXISTS(SELECT 1 FROM public.teams t WHERE t.workspace_id=p_workspace_id AND t.id=m.team_id AND m.team_digest IS DISTINCT FROM encode(extensions.digest((to_jsonb(t)-'updated_at'-'created_at')::text,'sha256'),'hex'))
  OR EXISTS(SELECT 1 FROM public.teams t WHERE t.id=m.team_id AND
   (SELECT coalesce(jsonb_agg(jsonb_build_object('agent',tm.agent_id,'role',tm.role,'position',tm.position) ORDER BY tm.position),'[]'::jsonb) FROM public.team_members tm WHERE tm.team_id=t.id)
   IS DISTINCT FROM (SELECT jsonb_agg(jsonb_build_object('agent',s.value->>'agent_id','role','worker','position',s.ordinality-1) ORDER BY s.ordinality) FROM jsonb_array_elements(t.config->'steps') WITH ORDINALITY s))
 THEN RAISE EXCEPTION 'Demo resources were edited; review and remove them individually to preserve your changes'; END IF;
 IF EXISTS(SELECT 1 FROM public.team_members WHERE agent_id=ANY(m.agent_ids) AND team_id IS DISTINCT FROM m.team_id)
  OR EXISTS(SELECT 1 FROM public.tasks WHERE assigned_agent_id=ANY(m.agent_ids))
  OR EXISTS(SELECT 1 FROM public.teams t WHERE t.workspace_id=p_workspace_id AND t.id IS DISTINCT FROM m.team_id
   AND EXISTS(SELECT 1 FROM unnest(m.agent_ids) id WHERE t.config::text LIKE '%'||id::text||'%'))
 THEN RAISE EXCEPTION 'Demo agents are used outside the demo team; preserve or remove those references first'; END IF;
 DELETE FROM public.teams WHERE id=m.team_id AND workspace_id=p_workspace_id;
 DELETE FROM public.agents WHERE id=ANY(m.agent_ids) AND workspace_id=p_workspace_id;
 DELETE FROM public.workspace_demo_seeds WHERE workspace_id=p_workspace_id;
 UPDATE public.workspaces SET settings=coalesce(settings,'{}'::jsonb)||jsonb_build_object('demo_seeded',false,'demo_team_id',NULL) WHERE id=p_workspace_id;
END;
$$;
CREATE FUNCTION public.clear_legacy_demo_marker(p_workspace_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF coalesce(public.get_workspace_role(p_workspace_id),'') NOT IN('owner','admin','member') OR auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authorized to clear a demo marker'; END IF;
 PERFORM 1 FROM public.workspaces WHERE id=p_workspace_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.workspace_demo_seeds WHERE workspace_id=p_workspace_id) THEN RAISE EXCEPTION 'Tracked demo exists; refresh before changing its marker'; END IF;
 UPDATE public.workspaces SET settings=coalesce(settings,'{}'::jsonb)||jsonb_build_object('demo_seeded',false,'demo_team_id',NULL) WHERE id=p_workspace_id;
END;
$$;
REVOKE ALL ON FUNCTION public.get_demo_workspace(uuid),public.seed_demo_workspace(uuid,jsonb,jsonb),public.remove_demo_workspace(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_demo_workspace(uuid),public.seed_demo_workspace(uuid,jsonb,jsonb),public.remove_demo_workspace(uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.clear_legacy_demo_marker(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.clear_legacy_demo_marker(uuid) TO authenticated;
