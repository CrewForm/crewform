-- ============================================================================
-- delete_user.sql — Completely remove a user and ALL linked data
-- ============================================================================
--
-- USAGE:
--   1. Replace the UUID on line 43 with the target user's auth.users.id
--   2. Run in Supabase SQL Editor with service_role
--   3. The user will no longer be able to log in and all their data is gone
--
-- HOW IT WORKS:
--   Deleting from auth.users cascades through every FK in the public schema:
--
--   auth.users  ──CASCADE──▶  workspaces (owner_id)
--                                 └── CASCADE ──▶  agents, tasks, teams, team_members,
--                                                   team_runs, team_messages, team_handoffs,
--                                                   agent_tasks, api_keys, agent_triggers,
--                                                   output_routes, subscriptions, ee_licenses,
--                                                   usage_records, audit_logs, workspace_invitations,
--                                                   messaging_channels, custom_tools, zapier_subscriptions,
--                                                   file_attachments, agent_installs, agent_reviews
--               ──CASCADE──▶  workspace_members (user_id)
--               ──CASCADE──▶  user_profiles (id)
--               ──CASCADE──▶  super_admins (user_id)
--               ──CASCADE──▶  agent_reviews (user_id)
--               ──CASCADE──▶  tasks (created_by)
--               ──CASCADE──▶  team_runs (created_by)
--               ──CASCADE──▶  workspace_invitations (invited_by)
--               ──CASCADE──▶  marketplace_submissions (submitted_by)
--               ──SET NULL──▶  audit_log (user_id), audit_logs (actor_id)
--               ──SET NULL──▶  agent_installs (installed_by)
--               ──SET NULL──▶  rest_api_keys (created_by)
--               ──SET NULL──▶  file_attachments (created_by)
--
-- ⚠️  WARNING: This is IRREVERSIBLE. Back up first if needed.
-- ============================================================================

DO $$
DECLARE
    -- ┌──────────────────────────────────────────────────────────────────────┐
    -- │  SET THE TARGET USER ID HERE                                        │
    -- └──────────────────────────────────────────────────────────────────────┘
    v_uid  UUID := '00000000-0000-0000-0000-000000000000';

    v_email  TEXT;
    v_ws     INTEGER;
    v_tasks  INTEGER;
    v_agents INTEGER;
    v_teams  INTEGER;
    v_delete BOOLEAN := false;  -- Set to TRUE to actually delete
BEGIN
    -- Look up the user
    SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

    IF v_email IS NULL THEN
        RAISE EXCEPTION 'User % not found in auth.users', v_uid;
    END IF;

    -- Count owned workspaces
    SELECT count(*) INTO v_ws FROM public.workspaces WHERE owner_id = v_uid;

    -- Count tasks created
    SELECT count(*) INTO v_tasks FROM public.tasks WHERE created_by = v_uid;

    -- Count agents across owned workspaces
    SELECT count(*) INTO v_agents
    FROM public.agents a
    JOIN public.workspaces w ON a.workspace_id = w.id
    WHERE w.owner_id = v_uid;

    -- Count teams across owned workspaces
    SELECT count(*) INTO v_teams
    FROM public.teams t
    JOIN public.workspaces w ON t.workspace_id = w.id
    WHERE w.owner_id = v_uid;

    RAISE NOTICE '──────────────────────────────────────────';
    RAISE NOTICE 'User:        % (%)', v_email, v_uid;
    RAISE NOTICE 'Workspaces:  %', v_ws;
    RAISE NOTICE 'Agents:      %', v_agents;
    RAISE NOTICE 'Teams:       %', v_teams;
    RAISE NOTICE 'Tasks:       %', v_tasks;
    RAISE NOTICE '──────────────────────────────────────────';

    IF v_delete THEN
        DELETE FROM auth.users WHERE id = v_uid;
        RAISE NOTICE '✅ User % deleted. All linked data cascade-removed.', v_email;
    ELSE
        RAISE NOTICE '⚠️  DRY RUN — set v_delete := true to actually delete.';
    END IF;
END
$$;
