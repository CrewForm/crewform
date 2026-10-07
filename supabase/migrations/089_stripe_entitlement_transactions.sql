-- SPDX-License-Identifier: AGPL-3.0-or-later
CREATE TABLE public.stripe_event_receipts (
    event_id text PRIMARY KEY,
    workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    event_created bigint NOT NULL,
    outcome text NOT NULL,
    processed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.stripe_event_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stripe_event_receipts FROM anon,authenticated;
GRANT ALL ON public.stripe_event_receipts TO service_role;
ALTER TABLE public.subscriptions ADD COLUMN stripe_last_event_created bigint NOT NULL DEFAULT 0;
CREATE FUNCTION public.apply_stripe_entitlement(p_event_id text,p_event_created bigint,p_workspace_id uuid,p_customer_id text,p_subscription_id text,p_plan text,p_status text,p_period_start timestamptz,p_period_end timestamptz,p_cancel_at_period_end boolean,p_replacement boolean DEFAULT false)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_sub public.subscriptions%ROWTYPE;
BEGIN
    PERFORM 1 FROM public.workspaces WHERE id=p_workspace_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Unknown billing workspace'; END IF;
    IF EXISTS(SELECT 1 FROM public.stripe_event_receipts WHERE event_id=p_event_id) THEN RETURN 'duplicate'; END IF;
    IF p_plan NOT IN ('free','pro','team') OR p_status NOT IN ('active','trialing','past_due','cancelled','incomplete') THEN RAISE EXCEPTION 'Unknown billing entitlement'; END IF;
    SELECT * INTO v_sub FROM public.subscriptions WHERE workspace_id=p_workspace_id FOR UPDATE;
    IF v_sub.stripe_customer_id IS NOT NULL AND v_sub.stripe_customer_id<>p_customer_id THEN RAISE EXCEPTION 'Billing customer mismatch'; END IF;
    IF (v_sub.stripe_subscription_id IS NOT NULL AND v_sub.stripe_subscription_id<>p_subscription_id AND NOT p_replacement)
       OR p_event_created<v_sub.stripe_last_event_created THEN
        INSERT INTO public.stripe_event_receipts VALUES(p_event_id,p_workspace_id,p_event_created,'stale',now()); RETURN 'stale';
    END IF;
    INSERT INTO public.subscriptions(workspace_id,stripe_customer_id,stripe_subscription_id,plan,status,current_period_start,current_period_end,cancel_at_period_end,stripe_last_event_created)
    VALUES(p_workspace_id,p_customer_id,p_subscription_id,p_plan,p_status,p_period_start,p_period_end,p_cancel_at_period_end,p_event_created)
    ON CONFLICT(workspace_id) DO UPDATE SET stripe_customer_id=EXCLUDED.stripe_customer_id,stripe_subscription_id=EXCLUDED.stripe_subscription_id,
      plan=EXCLUDED.plan,status=EXCLUDED.status,current_period_start=EXCLUDED.current_period_start,current_period_end=EXCLUDED.current_period_end,
      cancel_at_period_end=EXCLUDED.cancel_at_period_end,stripe_last_event_created=EXCLUDED.stripe_last_event_created;
    UPDATE public.workspaces SET plan=CASE WHEN p_status IN ('cancelled','incomplete') THEN 'free' ELSE p_plan END WHERE id=p_workspace_id;
    INSERT INTO public.stripe_event_receipts VALUES(p_event_id,p_workspace_id,p_event_created,'applied',now());
    RETURN 'applied';
END;
$$;
REVOKE ALL ON FUNCTION public.apply_stripe_entitlement(text,bigint,uuid,text,text,text,text,timestamptz,timestamptz,boolean,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_stripe_entitlement(text,bigint,uuid,text,text,text,text,timestamptz,timestamptz,boolean,boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.sync_subscription_to_license()
RETURNS TRIGGER AS $$
DECLARE
    v_features TEXT[];
BEGIN
    -- Only act when plan or status actually changed
    IF TG_OP = 'UPDATE'
       AND OLD.plan = NEW.plan
       AND OLD.status = NEW.status
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
            CASE WHEN NEW.status='past_due' THEN coalesce(NEW.current_period_end,NOW())+interval '7 days' ELSE NEW.current_period_end END,
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
