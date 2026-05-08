-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Copyright (C) 2026 CrewForm
--
-- 080_fix_suspend_team_runs_column.sql
-- Fix admin_suspend_workspace: team_runs uses 'error_message' not 'error'
--

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

    -- Auto-fail queued tasks
    UPDATE public.tasks
       SET status    = 'failed',
           error     = 'Workspace suspended: ' || p_reason,
           updated_at = NOW()
     WHERE workspace_id = p_workspace_id
       AND status IN ('pending', 'dispatched');

    -- Auto-fail queued team runs (column is error_message, not error)
    UPDATE public.team_runs
       SET status        = 'failed',
           error_message = 'Workspace suspended: ' || p_reason,
           completed_at  = NOW()
     WHERE workspace_id = p_workspace_id
       AND status = 'pending';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
