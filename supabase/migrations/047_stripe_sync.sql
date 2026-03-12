-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Copyright (C) 2026 CrewForm
--
-- 047_stripe_sync.sql — Auto-sync subscriptions → ee_licenses when plan changes.
-- When a workspace's subscription is updated (via Stripe webhook), this trigger
-- creates or updates the corresponding ee_licenses row so EE feature gating
-- works automatically for paying customers.

-- ─── Plan → Features mapping function ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.features_for_plan(p_plan TEXT)
RETURNS TEXT[] AS $$
BEGIN
    CASE p_plan
        WHEN 'pro' THEN
            RETURN ARRAY[
                'prompt_history', 'advanced_analytics', 'file_attachments',
                'advanced_webhooks', 'team_triggers', 'billing',
                'orchestrator_mode', 'messaging_channels', 'custom_tools'
            ];
        WHEN 'team' THEN
            RETURN ARRAY[
                'prompt_history', 'advanced_analytics', 'file_attachments',
                'advanced_webhooks', 'team_triggers', 'billing',
                'orchestrator_mode', 'messaging_channels', 'custom_tools',
                'collaboration_mode', 'team_memory', 'rbac'
            ];
        WHEN 'enterprise' THEN
            RETURN ARRAY[
                'prompt_history', 'advanced_analytics', 'file_attachments',
                'advanced_webhooks', 'team_triggers', 'billing',
                'orchestrator_mode', 'messaging_channels', 'custom_tools',
                'collaboration_mode', 'team_memory', 'rbac',
                'audit_logs', 'swarm', 'marketplace_publish', 'admin_panel'
            ];
        ELSE
            RETURN ARRAY[]::TEXT[];
    END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ─── Trigger function: sync subscription plan → ee_licenses ─────────────────

CREATE OR REPLACE FUNCTION public.sync_subscription_to_license()
RETURNS TRIGGER AS $$
DECLARE
    v_features TEXT[];
BEGIN
    -- Only act when plan or status actually changed
    IF TG_OP = 'UPDATE'
       AND OLD.plan = NEW.plan
       AND OLD.status = NEW.status THEN
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
            NEW.current_period_end,
            CASE WHEN NEW.status = 'past_due' THEN 'active' ELSE 'active' END,
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── Attach trigger ──────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_sync_subscription_license ON public.subscriptions;

CREATE TRIGGER trg_sync_subscription_license
    AFTER INSERT OR UPDATE ON public.subscriptions
    FOR EACH ROW EXECUTE FUNCTION public.sync_subscription_to_license();
