-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Copyright (C) 2026 CrewForm
--
-- 061_mcp_servers.sql — MCP (Model Context Protocol) server configuration.
-- Each workspace can connect to external MCP servers whose tools become
-- available to agents during task execution.

-- ─── Table ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.mcp_servers (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    description  TEXT DEFAULT '',
    url          TEXT NOT NULL,                              -- server URL (HTTP) or command (stdio)
    transport    TEXT NOT NULL DEFAULT 'streamable-http'     -- 'streamable-http' | 'sse' | 'stdio'
                 CHECK (transport IN ('streamable-http', 'sse', 'stdio')),
    config       JSONB DEFAULT '{}'::jsonb,                  -- env vars, auth headers, command args
    is_enabled   BOOLEAN DEFAULT true,
    tools_cache  JSONB DEFAULT '[]'::jsonb,                  -- cached tool list from last discovery
    created_at   TIMESTAMPTZ DEFAULT now(),
    updated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mcp_servers_workspace
    ON public.mcp_servers(workspace_id);

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.mcp_servers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mcp_servers_select"
    ON public.mcp_servers FOR SELECT
    USING (
        workspace_id IN (
            SELECT workspace_id FROM public.workspace_members
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "mcp_servers_insert"
    ON public.mcp_servers FOR INSERT
    WITH CHECK (
        workspace_id IN (
            SELECT workspace_id FROM public.workspace_members
            WHERE user_id = auth.uid()
              AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY "mcp_servers_update"
    ON public.mcp_servers FOR UPDATE
    USING (
        workspace_id IN (
            SELECT workspace_id FROM public.workspace_members
            WHERE user_id = auth.uid()
              AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY "mcp_servers_delete"
    ON public.mcp_servers FOR DELETE
    USING (
        workspace_id IN (
            SELECT workspace_id FROM public.workspace_members
            WHERE user_id = auth.uid()
              AND role IN ('owner', 'admin')
        )
    );

-- ─── Updated-at trigger ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_mcp_servers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER mcp_servers_updated_at
    BEFORE UPDATE ON public.mcp_servers
    FOR EACH ROW
    EXECUTE FUNCTION update_mcp_servers_updated_at();

-- ─── Realtime ────────────────────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE public.mcp_servers;
