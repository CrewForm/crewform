-- 046_beta_user_management.sql — RPC functions for beta user approval
--
-- Provides admin-only functions to list beta users and approve them.
-- Uses auth.users table (requires service_role or super admin check).

-- 1. List beta users (users with is_beta = true in user_metadata)
CREATE OR REPLACE FUNCTION list_beta_users()
RETURNS TABLE (
    user_id uuid,
    email text,
    full_name text,
    is_beta boolean,
    beta_approved boolean,
    created_at timestamptz,
    last_sign_in_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Verify caller is a super admin
    IF NOT EXISTS (SELECT 1 FROM super_admins WHERE super_admins.user_id = auth.uid()) THEN
        RAISE EXCEPTION 'Unauthorized: super admin access required';
    END IF;

    RETURN QUERY
    SELECT
        u.id AS user_id,
        u.email::text,
        COALESCE(u.raw_user_meta_data->>'full_name', '')::text AS full_name,
        COALESCE((u.raw_user_meta_data->>'is_beta')::boolean, false) AS is_beta,
        COALESCE((u.raw_user_meta_data->>'beta_approved')::boolean, false) AS beta_approved,
        u.created_at,
        u.last_sign_in_at
    FROM auth.users u
    WHERE COALESCE((u.raw_user_meta_data->>'is_beta')::boolean, false) = true
    ORDER BY u.created_at DESC;
END;
$$;

-- 2. Approve a beta user (set beta_approved = true in user_metadata)
CREATE OR REPLACE FUNCTION approve_beta_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Verify caller is a super admin
    IF NOT EXISTS (SELECT 1 FROM super_admins WHERE super_admins.user_id = auth.uid()) THEN
        RAISE EXCEPTION 'Unauthorized: super admin access required';
    END IF;

    UPDATE auth.users
    SET raw_user_meta_data = raw_user_meta_data || '{"beta_approved": true}'::jsonb
    WHERE id = p_user_id;
END;
$$;

-- 3. Revoke beta approval (set beta_approved = false)
CREATE OR REPLACE FUNCTION revoke_beta_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Verify caller is a super admin
    IF NOT EXISTS (SELECT 1 FROM super_admins WHERE super_admins.user_id = auth.uid()) THEN
        RAISE EXCEPTION 'Unauthorized: super admin access required';
    END IF;

    UPDATE auth.users
    SET raw_user_meta_data = raw_user_meta_data || '{"beta_approved": false}'::jsonb
    WHERE id = p_user_id;
END;
$$;
