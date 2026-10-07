-- SPDX-License-Identifier: AGPL-3.0-or-later
CREATE FUNCTION public.retry_output_delivery(p_delivery_id uuid,p_acknowledge_duplicate boolean DEFAULT false) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_delivery public.output_delivery_queue%ROWTYPE;
BEGIN
 SELECT * INTO STRICT v_delivery FROM public.output_delivery_queue WHERE id=p_delivery_id FOR UPDATE;
 IF coalesce(auth.role(),'')<>'service_role' AND coalesce(public.get_workspace_role(v_delivery.workspace_id),'') NOT IN('owner','admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF v_delivery.state NOT IN('failed','uncertain') THEN RAISE EXCEPTION 'Delivery is not retryable'; END IF;
 IF v_delivery.state='uncertain' AND NOT p_acknowledge_duplicate THEN RAISE EXCEPTION 'Delivery may already have occurred; acknowledge duplicate risk'; END IF;
 UPDATE public.output_delivery_queue SET state='pending',lease=NULL,lease_until=NULL,next_attempt_at=now() WHERE id=p_delivery_id;
END;
$$;
REVOKE ALL ON FUNCTION public.retry_output_delivery(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.retry_output_delivery(uuid,boolean) TO authenticated,service_role;
-- Retention runs without an external worker, including inactive widgets.
SELECT cron.schedule('crewform-chat-retention','7 * * * *',$cron$
 DELETE FROM public.chat_sessions WHERE updated_at<now()-interval '30 days';
 DELETE FROM public.widget_rate_windows WHERE window_start<now()-interval '2 days';
 DELETE FROM public.output_delivery_queue WHERE state='sent' AND created_at<now()-interval '30 days';
$cron$);

CREATE FUNCTION public.get_workspace_quota(p_workspace_id uuid,p_resource text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_ws public.workspaces%ROWTYPE; v_limit integer; v_current integer:=0; v_table text; v_hosted boolean;
BEGIN
 IF NOT public.is_workspace_member(p_workspace_id) AND coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Forbidden'; END IF;
 SELECT * INTO STRICT v_ws FROM public.workspaces WHERE id=p_workspace_id;
 SELECT hosted INTO STRICT v_hosted FROM public.deployment_policy WHERE singleton;
 SELECT max_value INTO v_limit FROM public.workspace_entitlement_overrides WHERE workspace_id=p_workspace_id AND resource=p_resource AND (max_value<>-1 OR v_ws.plan IN('team','enterprise'));
 IF v_limit IS NULL THEN SELECT max_value INTO v_limit FROM public.plan_limits WHERE resource=p_resource AND plan=CASE WHEN v_ws.trial_expires_at>now() THEN 'team' ELSE v_ws.plan END; END IF;
 IF v_limit IS NULL THEN RAISE EXCEPTION 'Unknown quota'; END IF;
 IF NOT v_hosted OR v_ws.is_beta THEN v_limit:=CASE WHEN p_resource='csv_export' AND NOT v_hosted THEN 0 ELSE -1 END; END IF;
 IF p_resource='tasks_per_month' THEN
  SELECT count(*) INTO v_current FROM public.execution_usage WHERE workspace_id=p_workspace_id AND month=date_trunc('month',now() AT TIME ZONE 'UTC')::date AND state<>'released';
 ELSE
  v_table:=CASE p_resource WHEN 'agents' THEN 'agents' WHEN 'teams' THEN 'teams' WHEN 'members' THEN 'workspace_members' WHEN 'triggers' THEN 'agent_triggers' WHEN 'knowledge_documents' THEN 'knowledge_documents' END;
  IF v_table IS NOT NULL THEN EXECUTE format('SELECT count(*) FROM public.%I WHERE workspace_id=$1',v_table) INTO v_current USING p_workspace_id; END IF;
 END IF;
 RETURN jsonb_build_object('allowed',v_limit=-1 OR v_current<v_limit,'current',v_current,'limit',v_limit,'resource',p_resource);
END;
$$;
REVOKE ALL ON FUNCTION public.get_workspace_quota(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_workspace_quota(uuid,text) TO authenticated,service_role;
