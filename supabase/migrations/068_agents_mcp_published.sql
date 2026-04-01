-- Migration: Add is_mcp_published flag to agents table
-- Allows agents to be exposed via the MCP Server endpoint

ALTER TABLE public.agents
ADD COLUMN IF NOT EXISTS is_mcp_published BOOLEAN NOT NULL DEFAULT FALSE;

-- Index for efficient MCP endpoint queries (find all MCP-published agents in a workspace)
CREATE INDEX IF NOT EXISTS idx_agents_mcp_published
ON public.agents (workspace_id)
WHERE is_mcp_published = TRUE;
