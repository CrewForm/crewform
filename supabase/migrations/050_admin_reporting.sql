-- 050_admin_reporting.sql
-- Super admin reporting: RPCs for auth.users data + RLS overrides for
-- audit_logs, usage_records, and user_profiles.

-- ─── RPC: admin_platform_stats ──────────────────────────────────────────────
-- Returns total users, active users (7d), total tokens, and total cost.
-- Only callable by super admins.

CREATE OR REPLACE FUNCTION public.admin_platform_stats()
RETURNS JSON AS $$
DECLARE
    v_total_users     BIGINT;
    v_active_7d       BIGINT;
    v_total_tokens    BIGINT;
    v_total_cost      NUMERIC(12,2);
BEGIN
    -- Guard: super admin only
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Forbidden';
    END IF;

    -- Count all users
    SELECT count(*) INTO v_total_users FROM auth.users;

    -- Users who signed in within the last 7 days
    SELECT count(*) INTO v_active_7d
    FROM auth.users
    WHERE last_sign_in_at >= NOW() - INTERVAL '7 days';

    -- Aggregate usage
    SELECT COALESCE(SUM(tokens_used), 0),
           COALESCE(SUM(cost_usd), 0)
    INTO v_total_tokens, v_total_cost
    FROM public.usage_records;

    RETURN json_build_object(
        'total_users',       v_total_users,
        'active_users_7d',   v_active_7d,
        'total_tokens',      v_total_tokens,
        'total_cost_usd',    v_total_cost
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ─── RPC: admin_list_users ──────────────────────────────────────────────────
-- Returns all users with profile info and workspace count.
-- Only callable by super admins.

CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE (
    id              UUID,
    email           TEXT,
    full_name       TEXT,
    created_at      TIMESTAMPTZ,
    last_sign_in_at TIMESTAMPTZ,
    workspace_count BIGINT
) AS $$
BEGIN
    -- Guard: super admin only
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Forbidden';
    END IF;

    RETURN QUERY
    SELECT
        au.id,
        au.email::TEXT,
        COALESCE(au.raw_user_meta_data->>'full_name', up.display_name, '')::TEXT AS full_name,
        au.created_at,
        au.last_sign_in_at,
        COALESCE(wm.ws_count, 0) AS workspace_count
    FROM auth.users au
    LEFT JOIN public.user_profiles up ON up.id = au.id
    LEFT JOIN (
        SELECT user_id, count(*) AS ws_count
        FROM public.workspace_members
        GROUP BY user_id
    ) wm ON wm.user_id = au.id
    ORDER BY au.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ─── Super Admin RLS overrides ──────────────────────────────────────────────

-- Audit logs: super admins can read all
CREATE POLICY "super_admin_audit_logs_select"
    ON public.audit_logs FOR SELECT
    USING (public.is_super_admin());

-- Usage records: super admins can read all
CREATE POLICY "super_admin_usage_records_select"
    ON public.usage_records FOR SELECT
    USING (public.is_super_admin());

-- User profiles: super admins can read all
CREATE POLICY "super_admin_user_profiles_select"
    ON public.user_profiles FOR SELECT
    USING (public.is_super_admin());
