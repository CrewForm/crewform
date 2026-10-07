-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Server-owned deployment policy, actor integrity and atomic usage reservations.
CREATE TABLE public.deployment_policy (
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
    hosted boolean NOT NULL DEFAULT true
);
INSERT INTO public.deployment_policy DEFAULT VALUES;
ALTER TABLE public.deployment_policy ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.deployment_policy FROM anon, authenticated;
GRANT ALL ON public.deployment_policy TO service_role;

CREATE TABLE public.execution_usage (
    job_kind text NOT NULL CHECK (job_kind IN ('tasks', 'team_runs')),
    job_id uuid NOT NULL,
    workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    month date NOT NULL DEFAULT date_trunc('month', now() AT TIME ZONE 'UTC')::date,
    state text NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved','started','settled','released')),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (job_kind, job_id)
);
CREATE INDEX ON public.execution_usage(workspace_id, month) WHERE state <> 'released';
ALTER TABLE public.execution_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY execution_usage_read ON public.execution_usage FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));
REVOKE ALL ON public.execution_usage FROM anon, authenticated;
GRANT SELECT ON public.execution_usage TO authenticated;
GRANT ALL ON public.execution_usage TO service_role;

CREATE TABLE public.workspace_entitlement_overrides (
    workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    resource text NOT NULL,
    max_value integer NOT NULL CHECK (max_value >= -1),
    PRIMARY KEY(workspace_id, resource)
);
ALTER TABLE public.workspace_entitlement_overrides ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.workspace_entitlement_overrides FROM anon, authenticated;
GRANT ALL ON public.workspace_entitlement_overrides TO service_role;
-- Preserve current paid customers' purchased unlimited run entitlement.
INSERT INTO public.workspace_entitlement_overrides(workspace_id,resource,max_value)
SELECT workspace_id,'tasks_per_month',-1 FROM public.subscriptions WHERE plan IN ('team','enterprise') AND stripe_subscription_id IS NOT NULL AND status IN ('active','trialing','past_due');
UPDATE public.plan_limits SET max_value = 10000 WHERE plan='team' AND resource='tasks_per_month';

ALTER TABLE public.tasks ADD COLUMN actor_type text NOT NULL DEFAULT 'legacy', ADD COLUMN actor_id text;
ALTER TABLE public.team_runs ADD COLUMN actor_type text NOT NULL DEFAULT 'legacy', ADD COLUMN actor_id text;
ALTER TABLE public.tasks ADD CONSTRAINT task_actor_type CHECK(actor_type IN ('user','api_key','system','legacy'));
ALTER TABLE public.team_runs ADD CONSTRAINT run_actor_type CHECK(actor_type IN ('user','api_key','system','legacy'));

CREATE FUNCTION public.protect_execution_actor() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
    IF octet_length(to_jsonb(NEW)::text)>1048576 THEN RAISE EXCEPTION 'Execution record exceeds size limit'; END IF;
    IF TG_OP='UPDATE' THEN
        IF NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
           OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.actor_type IS DISTINCT FROM OLD.actor_type OR NEW.actor_id IS DISTINCT FROM OLD.actor_id THEN
            RAISE EXCEPTION 'Execution initiator and workspace are immutable';
        END IF;
        IF auth.role()='authenticated' AND NOT public.is_super_admin() AND NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('running','completed','failed') THEN
            RAISE EXCEPTION 'Execution state is server-owned';
        END IF;
    ELSE
        IF auth.role()='authenticated' THEN
            IF NEW.created_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Invalid execution initiator'; END IF;
            NEW.actor_type := 'user'; NEW.actor_id := auth.uid()::text;
            IF NEW.status NOT IN ('pending','dispatched') THEN RAISE EXCEPTION 'Invalid initial execution state'; END IF;
        ELSE
            IF NEW.actor_type NOT IN ('api_key','system') THEN NEW.actor_type := 'system'; END IF;
            IF NEW.actor_type='api_key' AND NEW.actor_id IS NULL THEN RAISE EXCEPTION 'API key actor required'; END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER a_execution_actor BEFORE INSERT OR UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.protect_execution_actor();
CREATE TRIGGER a_execution_actor BEFORE INSERT OR UPDATE ON public.team_runs FOR EACH ROW EXECUTE FUNCTION public.protect_execution_actor();

CREATE FUNCTION public.enforce_execution_quota() RETURNS trigger
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
    v_plan := CASE WHEN v_ws.trial_expires_at > now() THEN 'team' ELSE v_ws.plan END;
    IF v_hosted AND NEW.status='running' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'running') THEN
        SELECT (SELECT count(*) FROM public.tasks WHERE workspace_id=NEW.workspace_id AND (TG_TABLE_NAME<>'tasks' OR id<>NEW.id) AND status IN ('running','waiting_for_input')) +
               (SELECT count(*) FROM public.team_runs WHERE workspace_id=NEW.workspace_id AND (TG_TABLE_NAME<>'team_runs' OR id<>NEW.id) AND status IN ('running','paused')) INTO v_active;
        IF v_active >= (CASE v_plan WHEN 'free' THEN 1 WHEN 'pro' THEN 3 ELSE 10 END) THEN RAISE EXCEPTION 'Workspace concurrency limit reached'; END IF;
    END IF;
    IF NEW.status IN ('dispatched','running') OR (TG_TABLE_NAME='team_runs' AND NEW.status='pending') THEN
        SELECT state INTO v_state FROM public.execution_usage WHERE job_kind=TG_TABLE_NAME AND job_id=NEW.id;
        IF v_state IS NULL OR v_state='released' THEN
            IF v_hosted AND NOT v_ws.is_beta THEN
                SELECT max_value INTO v_limit FROM public.workspace_entitlement_overrides WHERE workspace_id=NEW.workspace_id AND resource='tasks_per_month' AND (max_value<>-1 OR v_ws.plan IN('team','enterprise'));
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
CREATE TRIGGER b_execution_quota BEFORE INSERT OR UPDATE OF status ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.enforce_execution_quota();
CREATE TRIGGER b_execution_quota BEFORE INSERT OR UPDATE OF status ON public.team_runs FOR EACH ROW EXECUTE FUNCTION public.enforce_execution_quota();
-- Seed this month's existing work so deploying does not reset allowances.
INSERT INTO public.execution_usage(job_kind,job_id,workspace_id,month,state)
SELECT 'tasks',id,workspace_id,date_trunc('month',created_at AT TIME ZONE 'UTC')::date,CASE WHEN status='dispatched' THEN 'reserved' ELSE 'settled' END
FROM public.tasks WHERE created_at>=date_trunc('month',now()) AND status<>'pending'
UNION ALL SELECT 'team_runs',id,workspace_id,date_trunc('month',created_at AT TIME ZONE 'UTC')::date,CASE WHEN status='pending' THEN 'reserved' ELSE 'settled' END
FROM public.team_runs WHERE created_at>=date_trunc('month',now());

CREATE FUNCTION public.enforce_resource_quota() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_ws public.workspaces%ROWTYPE; v_limit integer; v_count integer; v_resource text;
BEGIN
    IF TG_OP='UPDATE' AND NEW.workspace_id IS NOT DISTINCT FROM OLD.workspace_id THEN RETURN NEW; END IF;
    SELECT * INTO STRICT v_ws FROM public.workspaces WHERE id=NEW.workspace_id FOR UPDATE;
    IF NOT (SELECT hosted FROM public.deployment_policy WHERE singleton) OR v_ws.is_beta THEN RETURN NEW; END IF;
    v_resource := CASE TG_TABLE_NAME WHEN 'workspace_members' THEN 'members' WHEN 'agent_triggers' THEN 'triggers' WHEN 'knowledge_documents' THEN 'knowledge_documents' ELSE TG_TABLE_NAME END;
    SELECT max_value INTO v_limit FROM public.plan_limits WHERE plan=CASE WHEN v_ws.trial_expires_at>now() THEN 'team' ELSE v_ws.plan END AND resource=v_resource;
    IF v_limit IS NULL THEN RAISE EXCEPTION 'Missing resource quota for %',v_resource; END IF;
    IF v_limit=-1 THEN RETURN NEW; END IF;
    EXECUTE format('SELECT count(*) FROM public.%I WHERE workspace_id=$1',TG_TABLE_NAME) INTO v_count USING NEW.workspace_id;
    IF v_limit>=0 AND v_count>=v_limit THEN RAISE EXCEPTION 'Workspace % limit reached',v_resource; END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER resource_quota BEFORE INSERT OR UPDATE OF workspace_id ON public.agents FOR EACH ROW EXECUTE FUNCTION public.enforce_resource_quota();
CREATE TRIGGER resource_quota BEFORE INSERT OR UPDATE OF workspace_id ON public.teams FOR EACH ROW EXECUTE FUNCTION public.enforce_resource_quota();
CREATE TRIGGER resource_quota BEFORE INSERT OR UPDATE OF workspace_id ON public.workspace_members FOR EACH ROW EXECUTE FUNCTION public.enforce_resource_quota();
CREATE TRIGGER resource_quota BEFORE INSERT OR UPDATE OF workspace_id ON public.agent_triggers FOR EACH ROW EXECUTE FUNCTION public.enforce_resource_quota();
CREATE TRIGGER resource_quota BEFORE INSERT OR UPDATE OF workspace_id ON public.knowledge_documents FOR EACH ROW EXECUTE FUNCTION public.enforce_resource_quota();
REVOKE ALL ON FUNCTION public.protect_execution_actor(),public.enforce_execution_quota(),public.enforce_resource_quota() FROM PUBLIC,anon,authenticated;
