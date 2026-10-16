-- SPDX-License-Identifier: MIT
-- Read-only public mode flag; authorization and hosted quotas stay server-owned.
CREATE OR REPLACE FUNCTION public.get_deployment_policy() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('hosted',hosted) FROM public.deployment_policy WHERE singleton;
$$;
REVOKE ALL ON FUNCTION public.get_deployment_policy() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_deployment_policy() TO authenticated,service_role;
COMMENT ON FUNCTION public.get_deployment_policy() IS 'Deployment mode only; clients cannot update hosting policy.';
CREATE OR REPLACE FUNCTION public.get_workspace_quota(p_workspace_id uuid,p_resource text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_ws public.workspaces%ROWTYPE; v_limit integer; v_current integer:=0; v_table text; v_hosted boolean;
BEGIN
 IF NOT public.is_workspace_member(p_workspace_id) AND coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Forbidden'; END IF;
 SELECT * INTO STRICT v_ws FROM public.workspaces WHERE id=p_workspace_id;
 SELECT hosted INTO STRICT v_hosted FROM public.deployment_policy WHERE singleton;
 SELECT max_value INTO v_limit FROM public.workspace_entitlement_overrides WHERE workspace_id=p_workspace_id AND resource=p_resource AND (max_value<>-1 OR public.effective_workspace_plan(v_ws.id) IN('team','enterprise'));
 IF v_limit IS NULL THEN SELECT max_value INTO v_limit FROM public.plan_limits WHERE resource=p_resource AND plan=public.effective_workspace_plan(v_ws.id); END IF;
 IF v_limit IS NULL THEN RAISE EXCEPTION 'Unknown quota'; END IF;
 IF NOT v_hosted OR v_ws.is_beta THEN v_limit:=CASE WHEN p_resource IN('csv_export','orchestrator','a2a_publish') THEN 1 ELSE -1 END; END IF;
 IF p_resource='tasks_per_month' THEN
  SELECT count(*) INTO v_current FROM public.execution_usage WHERE workspace_id=p_workspace_id AND month=date_trunc('month',now() AT TIME ZONE 'UTC')::date AND state<>'released';
 ELSE
  v_table:=CASE p_resource WHEN 'agents' THEN 'agents' WHEN 'teams' THEN 'teams' WHEN 'members' THEN 'workspace_members' WHEN 'triggers' THEN 'agent_triggers' WHEN 'knowledge_documents' THEN 'knowledge_documents' END;
  IF v_table IS NOT NULL THEN EXECUTE format('SELECT count(*) FROM public.%I WHERE workspace_id=$1',v_table) INTO v_current USING p_workspace_id; END IF;
 END IF;
 RETURN jsonb_build_object('allowed',v_limit=-1 OR v_current<v_limit,'current',v_current,'limit',v_limit,'resource',p_resource);
END;
$$;