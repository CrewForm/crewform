-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Comprehensive security hardening following the August 2026 audit.

BEGIN;

-- ---------------------------------------------------------------------------
-- Remove runner capabilities that cannot be safely exposed to tenant config.
-- ---------------------------------------------------------------------------

UPDATE public.mcp_servers
SET is_enabled = false,
    transport = 'streamable-http',
    config = config - 'command' - 'args' - 'env'
WHERE transport = 'stdio';

ALTER TABLE public.mcp_servers
    DROP CONSTRAINT IF EXISTS mcp_servers_transport_check;
ALTER TABLE public.mcp_servers
    ADD CONSTRAINT mcp_servers_transport_check
    CHECK (transport IN ('streamable-http', 'sse'));

UPDATE public.agents
SET tools = COALESCE((
    SELECT jsonb_agg(tool)
    FROM jsonb_array_elements(public.agents.tools) AS tool
    WHERE tool <> '"code_interpreter"'::jsonb
), '[]'::jsonb)
WHERE tools @> '["code_interpreter"]'::jsonb;

-- ---------------------------------------------------------------------------
-- Knowledge storage must be scoped to the workspace path prefix.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "knowledge_bucket_upload" ON storage.objects;
DROP POLICY IF EXISTS "knowledge_bucket_read" ON storage.objects;
DROP POLICY IF EXISTS "knowledge_bucket_delete" ON storage.objects;
DROP POLICY IF EXISTS "knowledge_bucket_service_role" ON storage.objects;

CREATE POLICY "knowledge_bucket_upload" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'knowledge'
        AND EXISTS (
            SELECT 1
            FROM public.workspace_members wm
            WHERE wm.user_id = (SELECT auth.uid())
              AND wm.workspace_id::text = (storage.foldername(name))[1]
        )
    );

CREATE POLICY "knowledge_bucket_read" ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'knowledge'
        AND EXISTS (
            SELECT 1
            FROM public.workspace_members wm
            WHERE wm.user_id = (SELECT auth.uid())
              AND wm.workspace_id::text = (storage.foldername(name))[1]
        )
    );

CREATE POLICY "knowledge_bucket_delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'knowledge'
        AND EXISTS (
            SELECT 1
            FROM public.workspace_members wm
            WHERE wm.user_id = (SELECT auth.uid())
              AND wm.workspace_id::text = (storage.foldername(name))[1]
        )
    );

CREATE POLICY "knowledge_bucket_service_role" ON storage.objects
    FOR ALL TO service_role
    USING (bucket_id = 'knowledge')
    WITH CHECK (bucket_id = 'knowledge');

-- ---------------------------------------------------------------------------
-- SECURITY DEFINER functions: deny PUBLIC/anon and grant only intended roles.
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.match_knowledge_chunks(uuid, uuid[], extensions.vector, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.match_knowledge_chunks(uuid, uuid[], extensions.vector, integer, text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hybrid_search_knowledge(uuid, uuid[], extensions.vector, text, integer, text[], double precision, double precision) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.match_team_memories(uuid, extensions.vector, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_knowledge_chunks(uuid, uuid[], extensions.vector, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.match_knowledge_chunks(uuid, uuid[], extensions.vector, integer, text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.hybrid_search_knowledge(uuid, uuid[], extensions.vector, text, integer, text[], double precision, double precision) TO service_role;
GRANT EXECUTE ON FUNCTION public.match_team_memories(uuid, extensions.vector, integer) TO service_role;

REVOKE ALL ON FUNCTION public.refresh_usage_summary() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_usage_summary() TO service_role;
REVOKE ALL ON TABLE public.usage_daily_summary FROM anon, authenticated;
GRANT SELECT ON TABLE public.usage_daily_summary TO service_role;

-- Harden future database functions by default. Functions intended for clients
-- must be granted explicitly in their migration.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- Injection scan RPCs: bind every operation to the caller and workspace.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_scan_task(
    p_workspace_id uuid,
    p_agent_id uuid,
    p_description text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_task_id uuid;
    v_user_id uuid := auth.uid();
BEGIN
    IF v_user_id IS NULL OR NOT public.is_workspace_member(p_workspace_id) THEN
        RAISE EXCEPTION 'Forbidden';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.agents
        WHERE id = p_agent_id AND workspace_id = p_workspace_id
    ) THEN
        RAISE EXCEPTION 'Agent does not belong to workspace';
    END IF;

    INSERT INTO public.tasks (
        workspace_id, title, description, assigned_agent_id,
        priority, status, created_by
    ) VALUES (
        p_workspace_id, '[System] Injection Scan', p_description, p_agent_id,
        'low', 'dispatched', v_user_id
    ) RETURNING id INTO v_task_id;
    RETURN v_task_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_scan_task_result(p_task_id uuid)
RETURNS TABLE(status text, result jsonb, error text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Forbidden'; END IF;
    RETURN QUERY
    SELECT t.status::text, t.result::jsonb, t.error::text
    FROM public.tasks t
    WHERE t.id = p_task_id
      AND t.title = '[System] Injection Scan'
      AND t.created_by = auth.uid()
      AND public.is_workspace_member(t.workspace_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_scan_task(p_task_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Forbidden'; END IF;
    DELETE FROM public.tasks t
    WHERE t.id = p_task_id
      AND t.title = '[System] Injection Scan'
      AND t.created_by = auth.uid()
      AND public.is_workspace_member(t.workspace_id);
END;
$$;

REVOKE ALL ON FUNCTION public.create_scan_task(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_scan_task_result(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_scan_task(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_scan_task(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_scan_task_result(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_scan_task(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Rate limiter: RLS plus caller-bound workspace checks and service-only cleanup.
-- ---------------------------------------------------------------------------

ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "api_rate_limits_service_role" ON public.api_rate_limits;
CREATE POLICY "api_rate_limits_service_role" ON public.api_rate_limits
    FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON TABLE public.api_rate_limits FROM anon, authenticated;
GRANT ALL ON TABLE public.api_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.api_rate_limit_check(
    p_workspace_id uuid,
    p_window_start timestamptz,
    p_max_requests integer
)
RETURNS TABLE(current_count integer, allowed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_count integer;
BEGIN
    IF (SELECT auth.role()) <> 'service_role'
       AND (auth.uid() IS NULL OR NOT public.is_workspace_member(p_workspace_id)) THEN
        RAISE EXCEPTION 'Forbidden';
    END IF;
    IF p_max_requests < 1 OR p_max_requests > 100000 THEN
        RAISE EXCEPTION 'Invalid rate limit';
    END IF;

    INSERT INTO public.api_rate_limits (workspace_id, window_start, request_count)
    VALUES (p_workspace_id, date_trunc('minute', p_window_start), 1)
    ON CONFLICT (workspace_id, window_start)
    DO UPDATE SET request_count = public.api_rate_limits.request_count + 1
    RETURNING public.api_rate_limits.request_count INTO v_count;
    RETURN QUERY SELECT v_count, v_count <= p_max_requests;
END;
$$;

CREATE OR REPLACE FUNCTION public.api_rate_limit_cleanup()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
    DELETE FROM public.api_rate_limits
    WHERE window_start < now() - interval '1 hour';
$$;

REVOKE ALL ON FUNCTION public.api_rate_limit_check(uuid, timestamptz, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.api_rate_limit_check(uuid, timestamptz, integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.api_rate_limit_cleanup() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_rate_limit_cleanup() TO service_role;

-- ---------------------------------------------------------------------------
-- Workspace membership and tenant-bound row mutations.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "workspace_members_insert" ON public.workspace_members;
DROP POLICY IF EXISTS "workspace_members_update" ON public.workspace_members;
DROP POLICY IF EXISTS "workspace_members_delete" ON public.workspace_members;

CREATE POLICY "workspace_members_insert" ON public.workspace_members
    FOR INSERT TO authenticated
    WITH CHECK (
        user_id <> (SELECT owner_id FROM public.workspaces WHERE id = workspace_id)
        AND (
            (public.get_workspace_role(workspace_id) = 'owner' AND role IN ('admin', 'manager', 'member', 'viewer'))
            OR (public.get_workspace_role(workspace_id) = 'admin' AND role IN ('manager', 'member', 'viewer'))
        )
    );

CREATE POLICY "workspace_members_update" ON public.workspace_members
    FOR UPDATE TO authenticated
    USING (
        user_id <> (SELECT owner_id FROM public.workspaces WHERE id = workspace_id)
        AND (
            public.get_workspace_role(workspace_id) = 'owner'
            OR (public.get_workspace_role(workspace_id) = 'admin' AND role IN ('manager', 'member', 'viewer'))
        )
    )
    WITH CHECK (
        user_id <> (SELECT owner_id FROM public.workspaces WHERE id = workspace_id)
        AND (
            (public.get_workspace_role(workspace_id) = 'owner' AND role IN ('admin', 'manager', 'member', 'viewer'))
            OR (public.get_workspace_role(workspace_id) = 'admin' AND role IN ('manager', 'member', 'viewer'))
        )
    );

CREATE POLICY "workspace_members_delete" ON public.workspace_members
    FOR DELETE TO authenticated
    USING (
        user_id <> (SELECT owner_id FROM public.workspaces WHERE id = workspace_id)
        AND (
            public.get_workspace_role(workspace_id) = 'owner'
            OR (public.get_workspace_role(workspace_id) = 'admin' AND role IN ('manager', 'member', 'viewer'))
        )
    );

DROP POLICY IF EXISTS "tasks_update" ON public.tasks;
CREATE POLICY "tasks_update" ON public.tasks
    FOR UPDATE TO authenticated
    USING (
        created_by = (SELECT auth.uid())
        OR public.get_workspace_role(workspace_id) IN ('owner', 'admin', 'manager')
    )
    WITH CHECK (
        public.is_workspace_member(workspace_id)
        AND (
            created_by = (SELECT auth.uid())
            OR public.get_workspace_role(workspace_id) IN ('owner', 'admin', 'manager')
        )
    );

DROP POLICY IF EXISTS "team_runs_update" ON public.team_runs;
CREATE POLICY "team_runs_update" ON public.team_runs
    FOR UPDATE TO authenticated
    USING (
        created_by = (SELECT auth.uid())
        OR public.get_workspace_role(workspace_id) IN ('owner', 'admin', 'manager')
    )
    WITH CHECK (
        public.is_workspace_member(workspace_id)
        AND (
            created_by = (SELECT auth.uid())
            OR public.get_workspace_role(workspace_id) IN ('owner', 'admin', 'manager')
        )
    );

CREATE OR REPLACE FUNCTION public.validate_tenant_references()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF TG_TABLE_NAME = 'tasks' THEN
        IF NEW.assigned_agent_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM public.agents WHERE id = NEW.assigned_agent_id AND workspace_id = NEW.workspace_id
        ) THEN RAISE EXCEPTION 'Assigned agent must belong to task workspace'; END IF;
        IF NEW.assigned_team_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM public.teams WHERE id = NEW.assigned_team_id AND workspace_id = NEW.workspace_id
        ) THEN RAISE EXCEPTION 'Assigned team must belong to task workspace'; END IF;
    ELSIF TG_TABLE_NAME = 'team_runs' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.teams WHERE id = NEW.team_id AND workspace_id = NEW.workspace_id
        ) THEN RAISE EXCEPTION 'Team must belong to run workspace'; END IF;
    ELSIF TG_TABLE_NAME = 'team_members' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.teams t
            JOIN public.agents a ON a.id = NEW.agent_id
            WHERE t.id = NEW.team_id AND t.workspace_id = a.workspace_id
        ) THEN RAISE EXCEPTION 'Agent and team must belong to the same workspace'; END IF;
    ELSIF TG_TABLE_NAME = 'agent_tasks' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.tasks t
            JOIN public.agents a ON a.id = NEW.agent_id
            WHERE t.id = NEW.task_id
              AND t.workspace_id = a.workspace_id
              AND t.workspace_id = NEW.workspace_id
        ) THEN RAISE EXCEPTION 'Agent and task must belong to the same workspace'; END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_task_tenant ON public.tasks;
CREATE TRIGGER trg_validate_task_tenant BEFORE INSERT OR UPDATE ON public.tasks
    FOR EACH ROW EXECUTE FUNCTION public.validate_tenant_references();
DROP TRIGGER IF EXISTS trg_validate_team_run_tenant ON public.team_runs;
CREATE TRIGGER trg_validate_team_run_tenant BEFORE INSERT OR UPDATE ON public.team_runs
    FOR EACH ROW EXECUTE FUNCTION public.validate_tenant_references();
DROP TRIGGER IF EXISTS trg_validate_team_member_tenant ON public.team_members;
CREATE TRIGGER trg_validate_team_member_tenant BEFORE INSERT OR UPDATE ON public.team_members
    FOR EACH ROW EXECUTE FUNCTION public.validate_tenant_references();
DROP TRIGGER IF EXISTS trg_validate_agent_task_tenant ON public.agent_tasks;
CREATE TRIGGER trg_validate_agent_task_tenant BEFORE INSERT OR UPDATE ON public.agent_tasks
    FOR EACH ROW EXECUTE FUNCTION public.validate_tenant_references();

-- ---------------------------------------------------------------------------
-- Billing/plan fields may only be changed by service role or guarded admin RPC.
-- ---------------------------------------------------------------------------

REVOKE UPDATE ON TABLE public.workspaces FROM anon, authenticated;
GRANT UPDATE (name, slug, settings) ON TABLE public.workspaces TO authenticated;
GRANT ALL ON TABLE public.workspaces TO service_role;

DROP POLICY IF EXISTS "subscriptions_insert" ON public.subscriptions;
DROP POLICY IF EXISTS "subscriptions_update" ON public.subscriptions;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.subscriptions FROM anon, authenticated;
GRANT ALL ON TABLE public.subscriptions TO service_role;

CREATE OR REPLACE FUNCTION public.admin_override_workspace_plan(
    p_workspace_id uuid,
    p_plan text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'Forbidden'; END IF;
    IF p_plan NOT IN ('free', 'pro', 'team', 'enterprise') THEN RAISE EXCEPTION 'Invalid plan'; END IF;

    INSERT INTO public.subscriptions (workspace_id, plan, status)
    VALUES (p_workspace_id, p_plan, CASE WHEN p_plan = 'free' THEN 'cancelled' ELSE 'active' END)
    ON CONFLICT (workspace_id) DO UPDATE
    SET plan = EXCLUDED.plan, status = EXCLUDED.status;
    UPDATE public.workspaces SET plan = p_plan WHERE id = p_workspace_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_workspace_beta(
    p_workspace_id uuid,
    p_is_beta boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'Forbidden'; END IF;
    UPDATE public.workspaces SET is_beta = p_is_beta WHERE id = p_workspace_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_override_workspace_plan(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_workspace_beta(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_override_workspace_plan(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_workspace_beta(uuid, boolean) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- API key tables: clients only receive metadata; secret mutation is Edge-only.
-- ---------------------------------------------------------------------------

ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS auth_hash text;
CREATE INDEX IF NOT EXISTS idx_api_keys_auth_hash
    ON public.api_keys(provider, auth_hash) WHERE auth_hash IS NOT NULL;

REVOKE ALL ON TABLE public.api_keys FROM anon, authenticated;
GRANT SELECT (id, workspace_id, provider, key_hint, is_valid, is_active, base_url, created_at, updated_at)
    ON TABLE public.api_keys TO authenticated;
GRANT ALL ON TABLE public.api_keys TO service_role;

REVOKE ALL ON TABLE public.google_connections FROM anon, authenticated;
GRANT SELECT (id, workspace_id, token_expiry, scopes, google_email, created_at, updated_at), DELETE
    ON TABLE public.google_connections TO authenticated;
GRANT ALL ON TABLE public.google_connections TO service_role;

DROP POLICY IF EXISTS "rest_api_keys_select" ON public.rest_api_keys;
DROP POLICY IF EXISTS "rest_api_keys_insert" ON public.rest_api_keys;
DROP POLICY IF EXISTS "rest_api_keys_delete" ON public.rest_api_keys;
CREATE POLICY "rest_api_keys_select" ON public.rest_api_keys
    FOR SELECT TO authenticated
    USING (public.get_workspace_role(workspace_id) IN ('owner', 'admin'));
CREATE POLICY "rest_api_keys_insert" ON public.rest_api_keys
    FOR INSERT TO authenticated
    WITH CHECK (
        public.get_workspace_role(workspace_id) IN ('owner', 'admin')
        AND created_by = (SELECT auth.uid())
    );
CREATE POLICY "rest_api_keys_delete" ON public.rest_api_keys
    FOR DELETE TO authenticated
    USING (public.get_workspace_role(workspace_id) IN ('owner', 'admin'));

DROP POLICY IF EXISTS "mcp_servers_select" ON public.mcp_servers;
DROP POLICY IF EXISTS "mcp_servers_insert" ON public.mcp_servers;
DROP POLICY IF EXISTS "mcp_servers_update" ON public.mcp_servers;
DROP POLICY IF EXISTS "mcp_servers_delete" ON public.mcp_servers;
CREATE POLICY "mcp_servers_select" ON public.mcp_servers
    FOR SELECT TO authenticated
    USING (public.get_workspace_role(workspace_id) IN ('owner', 'admin', 'manager'));
CREATE POLICY "mcp_servers_insert" ON public.mcp_servers
    FOR INSERT TO authenticated
    WITH CHECK (public.get_workspace_role(workspace_id) IN ('owner', 'admin'));
CREATE POLICY "mcp_servers_update" ON public.mcp_servers
    FOR UPDATE TO authenticated
    USING (public.get_workspace_role(workspace_id) IN ('owner', 'admin'))
    WITH CHECK (public.get_workspace_role(workspace_id) IN ('owner', 'admin'));
CREATE POLICY "mcp_servers_delete" ON public.mcp_servers
    FOR DELETE TO authenticated
    USING (public.get_workspace_role(workspace_id) IN ('owner', 'admin'));

DROP POLICY IF EXISTS "custom_tools_select" ON public.custom_tools;
DROP POLICY IF EXISTS "custom_tools_insert" ON public.custom_tools;
DROP POLICY IF EXISTS "custom_tools_update" ON public.custom_tools;
DROP POLICY IF EXISTS "custom_tools_delete" ON public.custom_tools;
CREATE POLICY "custom_tools_select" ON public.custom_tools
    FOR SELECT TO authenticated
    USING (public.get_workspace_role(workspace_id) IN ('owner', 'admin', 'manager'));
CREATE POLICY "custom_tools_insert" ON public.custom_tools
    FOR INSERT TO authenticated
    WITH CHECK (public.get_workspace_role(workspace_id) IN ('owner', 'admin', 'manager'));
CREATE POLICY "custom_tools_update" ON public.custom_tools
    FOR UPDATE TO authenticated
    USING (public.get_workspace_role(workspace_id) IN ('owner', 'admin', 'manager'))
    WITH CHECK (public.get_workspace_role(workspace_id) IN ('owner', 'admin', 'manager'));
CREATE POLICY "custom_tools_delete" ON public.custom_tools
    FOR DELETE TO authenticated
    USING (public.get_workspace_role(workspace_id) IN ('owner', 'admin', 'manager'));

DROP POLICY IF EXISTS "audit_log_insert" ON public.audit_log;
CREATE POLICY "audit_log_insert" ON public.audit_log
    FOR INSERT TO service_role WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Invitation acceptance: authenticated recipient only, one-time token.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.accept_invitation(invite_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    inv record;
    caller_email text := lower(COALESCE(auth.jwt()->>'email', ''));
BEGIN
    IF auth.uid() IS NULL OR caller_email = '' THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT * INTO inv
    FROM public.workspace_invitations
    WHERE token = invite_token
      AND status = 'pending'
      AND expires_at > now()
    FOR UPDATE;

    IF inv IS NULL OR lower(inv.email) <> caller_email THEN
        RETURN json_build_object('success', false, 'error', 'Invalid or expired invitation');
    END IF;

    INSERT INTO public.workspace_members (workspace_id, user_id, role)
    VALUES (inv.workspace_id, auth.uid(), inv.role)
    ON CONFLICT (workspace_id, user_id) DO NOTHING;
    UPDATE public.workspace_invitations SET status = 'accepted' WHERE id = inv.id;
    INSERT INTO public.audit_log (workspace_id, user_id, action, details)
    VALUES (inv.workspace_id, auth.uid(), 'member_joined',
            jsonb_build_object('email', inv.email, 'role', inv.role, 'invitation_id', inv.id));
    RETURN json_build_object('success', true, 'workspace_id', inv.workspace_id);
END;
$$;
REVOKE ALL ON FUNCTION public.accept_invitation(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_invitation(text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- OAuth state is opaque, expiring, one-time data available only to service role.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.oauth_states (
    state_hash text PRIMARY KEY,
    provider text NOT NULL,
    workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.oauth_states ENABLE ROW LEVEL SECURITY;
CREATE POLICY "oauth_states_service_role" ON public.oauth_states
    FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON TABLE public.oauth_states FROM anon, authenticated;
GRANT ALL ON TABLE public.oauth_states TO service_role;

-- Remove integration credentials previously copied into member-readable rows.
UPDATE public.tasks
SET source_channel = source_channel
    - 'bot_token' - 'trello_api_key' - 'trello_token' - 'linear_api_key'
WHERE source_channel ?| ARRAY['bot_token', 'trello_api_key', 'trello_token', 'linear_api_key'];
UPDATE public.team_runs
SET source_channel = source_channel
    - 'bot_token' - 'trello_api_key' - 'trello_token' - 'linear_api_key'
WHERE source_channel ?| ARRAY['bot_token', 'trello_api_key', 'trello_token', 'linear_api_key'];

COMMIT;
