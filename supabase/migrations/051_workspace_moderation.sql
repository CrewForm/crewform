-- 051_workspace_moderation.sql
-- Workspace suspension & deletion for super admin moderation.
-- Adds suspended_at / suspended_reason columns and admin RPCs.

-- ─── Columns ────────────────────────────────────────────────────────────────

ALTER TABLE public.workspaces
    ADD COLUMN IF NOT EXISTS suspended_at     TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS suspended_reason TEXT;

COMMENT ON COLUMN public.workspaces.suspended_at IS
    'Non-null when workspace is suspended. Members see a block page and cannot use the platform.';
COMMENT ON COLUMN public.workspaces.suspended_reason IS
    'Human-readable reason shown to workspace members explaining the suspension.';

-- ─── RPC: admin_suspend_workspace ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_suspend_workspace(
    p_workspace_id UUID,
    p_reason       TEXT DEFAULT 'Terms of Service violation'
)
RETURNS VOID AS $$
BEGIN
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Forbidden';
    END IF;

    UPDATE public.workspaces
    SET suspended_at     = NOW(),
        suspended_reason = p_reason
    WHERE id = p_workspace_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Workspace not found';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── RPC: admin_unsuspend_workspace ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_unsuspend_workspace(
    p_workspace_id UUID
)
RETURNS VOID AS $$
BEGIN
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Forbidden';
    END IF;

    UPDATE public.workspaces
    SET suspended_at     = NULL,
        suspended_reason = NULL
    WHERE id = p_workspace_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Workspace not found';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── RPC: admin_delete_workspace ────────────────────────────────────────────
-- Hard-deletes a workspace. All child rows (agents, teams, tasks, members,
-- api_keys, etc.) are removed via ON DELETE CASCADE.

CREATE OR REPLACE FUNCTION public.admin_delete_workspace(
    p_workspace_id UUID
)
RETURNS VOID AS $$
BEGIN
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Forbidden';
    END IF;

    DELETE FROM public.workspaces WHERE id = p_workspace_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Workspace not found';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── Super Admin DELETE policy ──────────────────────────────────────────────
-- The existing RLS policies only allow owners to delete their workspace.
-- Super admins need a DELETE policy to perform moderation deletions.

CREATE POLICY "super_admin_workspaces_delete"
    ON public.workspaces FOR DELETE
    USING (public.is_super_admin());
