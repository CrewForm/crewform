-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Grace is measured from first observed delinquency, not next month's period end.
ALTER TABLE public.subscriptions ADD COLUMN past_due_since timestamptz;
CREATE FUNCTION public.track_payment_grace() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.status='past_due' THEN NEW.past_due_since:=coalesce(NEW.past_due_since,CASE WHEN TG_OP='UPDATE' AND OLD.status='past_due' THEN OLD.past_due_since END,now()); ELSE NEW.past_due_since:=NULL; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER a_payment_grace BEFORE INSERT OR UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.track_payment_grace();
REVOKE ALL ON FUNCTION public.track_payment_grace() FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.effective_workspace_plan(p_workspace_id uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT CASE WHEN w.trial_expires_at>now() THEN 'team'
 WHEN EXISTS(SELECT 1 FROM public.subscriptions s WHERE s.workspace_id=w.id AND s.status='past_due' AND s.past_due_since+interval '7 days'<=now()) THEN 'free'
 ELSE w.plan END FROM public.workspaces w WHERE w.id=p_workspace_id;
$$;
REVOKE ALL ON FUNCTION public.effective_workspace_plan(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.sync_subscription_to_license()
RETURNS TRIGGER AS $$
DECLARE
    v_features TEXT[];
BEGIN
    -- Only act when plan or status actually changed
    IF TG_OP = 'UPDATE'
       AND OLD.plan = NEW.plan
       AND OLD.status = NEW.status
       AND OLD.past_due_since IS NOT DISTINCT FROM NEW.past_due_since
       AND OLD.current_period_start IS NOT DISTINCT FROM NEW.current_period_start
       AND OLD.current_period_end IS NOT DISTINCT FROM NEW.current_period_end THEN
        RETURN NEW;
    END IF;

    v_features := public.features_for_plan(NEW.plan);

    IF NEW.plan = 'free' OR NEW.status IN ('cancelled', 'incomplete') THEN
        -- Downgrade: deactivate any existing license
        UPDATE public.ee_licenses
           SET status = 'expired',
               metadata = metadata || jsonb_build_object('expired_reason', 'subscription_' || NEW.status)
         WHERE workspace_id = NEW.workspace_id
           AND status = 'active'
           AND license_key = 'stripe-managed';
    ELSE
        -- Upsert license for paid plan
        INSERT INTO public.ee_licenses (
            workspace_id, license_key, plan, features, seats,
            valid_from, valid_until, status, metadata
        ) VALUES (
            NEW.workspace_id,
            'stripe-managed',
            NEW.plan,
            v_features,
            CASE NEW.plan
                WHEN 'pro' THEN 3
                WHEN 'team' THEN 25
                WHEN 'enterprise' THEN 9999
                ELSE 1
            END,
            COALESCE(NEW.current_period_start, NOW()),
            CASE WHEN NEW.status='past_due' THEN NEW.past_due_since+interval '7 days' ELSE NEW.current_period_end END,
            'active',
            jsonb_build_object('source', 'stripe', 'stripe_subscription_id', NEW.stripe_subscription_id)
        )
        ON CONFLICT (workspace_id) WHERE status = 'active'
        DO UPDATE SET
            plan     = EXCLUDED.plan,
            features = EXCLUDED.features,
            seats    = EXCLUDED.seats,
            valid_from  = EXCLUDED.valid_from,
            valid_until = EXCLUDED.valid_until,
            metadata = EXCLUDED.metadata;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path='';
CREATE OR REPLACE FUNCTION public.enforce_execution_quota() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
    v_ws public.workspaces%ROWTYPE; v_limit integer; v_state text; v_active integer;
    v_month date := date_trunc('month',now() AT TIME ZONE 'UTC')::date;
    v_hosted boolean; v_plan text;
BEGIN
    -- Serializes all reservation and capacity mutations for this tenant.
    SELECT * INTO STRICT v_ws FROM public.workspaces WHERE id=NEW.workspace_id FOR UPDATE;
    SELECT hosted INTO STRICT v_hosted FROM public.deployment_policy WHERE singleton;
    IF v_ws.suspended_at IS NOT NULL AND NEW.status NOT IN ('cancelled','failed','completed') THEN RAISE EXCEPTION 'Workspace is suspended'; END IF;
    IF TG_TABLE_NAME='tasks' THEN
    IF TG_OP='INSERT' AND NEW.metadata ? 'widget_config_id' THEN
        IF (SELECT count(*) FROM public.tasks WHERE workspace_id=NEW.workspace_id AND status IN ('dispatched','running','waiting_for_input') AND metadata->>'widget_config_id'=NEW.metadata->>'widget_config_id') >=3 THEN RAISE EXCEPTION 'Widget concurrency limit reached'; END IF;
    END IF;
    END IF;
    v_plan := public.effective_workspace_plan(v_ws.id);
    IF v_hosted AND NEW.status='running' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'running') THEN
        SELECT (SELECT count(*) FROM public.tasks WHERE workspace_id=NEW.workspace_id AND (TG_TABLE_NAME<>'tasks' OR id<>NEW.id) AND status IN ('running','waiting_for_input')) +
               (SELECT count(*) FROM public.team_runs WHERE workspace_id=NEW.workspace_id AND (TG_TABLE_NAME<>'team_runs' OR id<>NEW.id) AND status IN ('running','paused')) INTO v_active;
        IF v_active >= (CASE v_plan WHEN 'free' THEN 1 WHEN 'pro' THEN 3 ELSE 10 END) THEN RAISE EXCEPTION 'Workspace concurrency limit reached'; END IF;
    END IF;
    IF NEW.status IN ('dispatched','running') OR (TG_TABLE_NAME='team_runs' AND NEW.status='pending') THEN
        SELECT state INTO v_state FROM public.execution_usage WHERE job_kind=TG_TABLE_NAME AND job_id=NEW.id;
        IF v_state IS NULL OR v_state='released' THEN
            IF v_hosted AND NOT v_ws.is_beta THEN
                SELECT max_value INTO v_limit FROM public.workspace_entitlement_overrides WHERE workspace_id=NEW.workspace_id AND resource='tasks_per_month' AND (max_value<>-1 OR v_plan IN('team','enterprise'));
                IF v_limit IS NULL THEN SELECT max_value INTO v_limit FROM public.plan_limits WHERE plan=v_plan AND resource='tasks_per_month'; END IF;
                IF v_limit IS NULL THEN RAISE EXCEPTION 'Missing execution quota'; END IF;
                IF v_limit>=0 AND (SELECT count(*) FROM public.execution_usage WHERE workspace_id=NEW.workspace_id AND month=v_month AND state<>'released')>=v_limit THEN
                    RAISE EXCEPTION 'Monthly workflow run limit reached';
                END IF;
            END IF;
            INSERT INTO public.execution_usage(job_kind,job_id,workspace_id,month,state) VALUES(TG_TABLE_NAME,NEW.id,NEW.workspace_id,v_month,'reserved')
            ON CONFLICT(job_kind,job_id) DO UPDATE SET state='reserved',month=EXCLUDED.month;
        END IF;
        IF NEW.status='running' THEN UPDATE public.execution_usage SET state='started' WHERE job_kind=TG_TABLE_NAME AND job_id=NEW.id AND state='reserved'; END IF;
    ELSIF NEW.status IN ('completed','failed','cancelled') THEN
        UPDATE public.execution_usage SET state=CASE WHEN state='reserved' AND NEW.status='cancelled' THEN 'released' ELSE 'settled' END
        WHERE job_kind=TG_TABLE_NAME AND job_id=NEW.id AND state<>'released';
    END IF;
    RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.enforce_resource_quota() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_ws public.workspaces%ROWTYPE; v_limit integer; v_count integer; v_resource text;
BEGIN
    IF TG_OP='UPDATE' AND NEW.workspace_id IS NOT DISTINCT FROM OLD.workspace_id THEN RETURN NEW; END IF;
    SELECT * INTO STRICT v_ws FROM public.workspaces WHERE id=NEW.workspace_id FOR UPDATE;
    IF NOT (SELECT hosted FROM public.deployment_policy WHERE singleton) OR v_ws.is_beta THEN RETURN NEW; END IF;
    v_resource := CASE TG_TABLE_NAME WHEN 'workspace_members' THEN 'members' WHEN 'agent_triggers' THEN 'triggers' WHEN 'knowledge_documents' THEN 'knowledge_documents' ELSE TG_TABLE_NAME END;
    SELECT max_value INTO v_limit FROM public.plan_limits WHERE plan=public.effective_workspace_plan(v_ws.id) AND resource=v_resource;
    IF v_limit IS NULL THEN RAISE EXCEPTION 'Missing resource quota for %',v_resource; END IF;
    IF v_limit=-1 THEN RETURN NEW; END IF;
    EXECUTE format('SELECT count(*) FROM public.%I WHERE workspace_id=$1',TG_TABLE_NAME) INTO v_count USING NEW.workspace_id;
    IF v_limit>=0 AND v_count>=v_limit THEN RAISE EXCEPTION 'Workspace % limit reached',v_resource; END IF;
    RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.workspace_has_execution_capacity(p_workspace_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT NOT (SELECT hosted FROM public.deployment_policy WHERE singleton) OR
 ((SELECT count(*) FROM public.tasks WHERE workspace_id=w.id AND status IN('running','waiting_for_input'))+
  (SELECT count(*) FROM public.team_runs WHERE workspace_id=w.id AND status IN('running','paused')))
 < CASE public.effective_workspace_plan(w.id) WHEN 'free' THEN 1 WHEN 'pro' THEN 3 ELSE 10 END
 FROM public.workspaces w WHERE w.id=p_workspace_id;
$$;
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
UPDATE public.subscriptions SET past_due_since=coalesce(updated_at,now()) WHERE status='past_due';
