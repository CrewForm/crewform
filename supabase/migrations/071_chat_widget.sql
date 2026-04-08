-- Chat Widget: embeddable chat for agents
-- Adds chat_widget_configs and chat_sessions tables

-- ─── Widget Configurations ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS chat_widget_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'Chat Widget',
    api_key TEXT NOT NULL UNIQUE,
    allowed_domains TEXT[] NOT NULL DEFAULT '{}',
    theme JSONB NOT NULL DEFAULT '{
        "mode": "light",
        "primaryColor": "#6bedb9",
        "bubblePosition": "bottom-right",
        "bubbleIcon": "chat",
        "brandName": "CrewForm",
        "showBranding": true
    }'::jsonb,
    welcome_message TEXT NOT NULL DEFAULT 'Hi! How can I help you today?',
    placeholder_text TEXT NOT NULL DEFAULT 'Type a message...',
    rate_limit_per_hour INTEGER NOT NULL DEFAULT 20,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for API key lookup (hot path on every chat message)
CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_widget_configs_api_key ON chat_widget_configs(api_key);
CREATE INDEX IF NOT EXISTS idx_chat_widget_configs_workspace ON chat_widget_configs(workspace_id);

-- ─── Chat Sessions ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    widget_config_id UUID NOT NULL REFERENCES chat_widget_configs(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    visitor_id TEXT NOT NULL,
    messages JSONB NOT NULL DEFAULT '[]'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Find sessions by visitor (hot path — session lookup on every message)
CREATE INDEX IF NOT EXISTS idx_chat_sessions_visitor ON chat_sessions(widget_config_id, visitor_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_workspace ON chat_sessions(workspace_id);

-- ─── RLS Policies ───────────────────────────────────────────────────────────

ALTER TABLE chat_widget_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;

-- Widget configs: workspace members can CRUD
CREATE POLICY chat_widget_configs_workspace_policy ON chat_widget_configs
    FOR ALL
    USING (workspace_id IN (
        SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    ))
    WITH CHECK (workspace_id IN (
        SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    ));

-- Chat sessions: workspace members can read, service role can write
CREATE POLICY chat_sessions_workspace_read ON chat_sessions
    FOR SELECT
    USING (workspace_id IN (
        SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    ));

-- Service role bypass for task runner writes
CREATE POLICY chat_sessions_service_write ON chat_sessions
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Grant service role access
ALTER TABLE chat_sessions FORCE ROW LEVEL SECURITY;

-- Updated_at trigger for chat_widget_configs
CREATE OR REPLACE FUNCTION update_chat_widget_configs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER chat_widget_configs_updated_at
    BEFORE UPDATE ON chat_widget_configs
    FOR EACH ROW
    EXECUTE FUNCTION update_chat_widget_configs_updated_at();

-- Updated_at trigger for chat_sessions
CREATE OR REPLACE FUNCTION update_chat_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER chat_sessions_updated_at
    BEFORE UPDATE ON chat_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_chat_sessions_updated_at();
