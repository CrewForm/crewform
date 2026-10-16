-- SPDX-License-Identifier: MIT
-- Copyright (C) 2026 CrewForm
--
-- 038_messaging_channels.sql — Native messaging channel integrations
--

-- ────────────────────────────────────────────────────────────────────────────
-- 1. messaging_channels table
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.messaging_channels (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  platform          TEXT NOT NULL CHECK (platform IN ('telegram', 'discord', 'slack', 'email')),
  name              TEXT NOT NULL,
  config            JSONB NOT NULL DEFAULT '{}',
  default_agent_id  UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  default_team_id   UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Either an agent or team must be set (or neither for manual routing)
  CONSTRAINT chk_agent_or_team CHECK (
    NOT (default_agent_id IS NOT NULL AND default_team_id IS NOT NULL)
  )
);

CREATE INDEX idx_messaging_channels_workspace
  ON public.messaging_channels(workspace_id);

CREATE INDEX idx_messaging_channels_platform
  ON public.messaging_channels(platform, is_active);

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Add source_channel to tasks and team_runs
--    Stores origin metadata so we can reply back to the same conversation.
--    Example: { "platform": "telegram", "chat_id": "123", "message_id": "456",
--               "bot_token": "...", "channel_db_id": "uuid" }
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS source_channel JSONB;

ALTER TABLE public.team_runs
  ADD COLUMN IF NOT EXISTS source_channel JSONB;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Message log — tracks inbound/outbound messages for observability
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.channel_message_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id      UUID NOT NULL REFERENCES public.messaging_channels(id) ON DELETE CASCADE,
  direction       TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  task_id         UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  team_run_id     UUID REFERENCES public.team_runs(id) ON DELETE SET NULL,
  platform_ref    JSONB,       -- platform-specific IDs (message_id, thread_ts, etc.)
  message_preview TEXT,        -- first 200 chars of the message
  status          TEXT NOT NULL DEFAULT 'delivered' CHECK (status IN ('delivered', 'failed')),
  error           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_channel_msg_log_channel
  ON public.channel_message_log(channel_id, created_at DESC);

-- ────────────────────────────────────────────────────────────────────────────
-- 4. RLS
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.messaging_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_message_log ENABLE ROW LEVEL SECURITY;

-- Users can manage channels in their own workspace
CREATE POLICY "messaging_channels_workspace_access"
  ON public.messaging_channels FOR ALL
  USING (workspace_id IN (
    SELECT id FROM public.workspaces WHERE owner_id = auth.uid()
  ))
  WITH CHECK (workspace_id IN (
    SELECT id FROM public.workspaces WHERE owner_id = auth.uid()
  ));

-- Service role bypass for Edge Functions (they use service_role key)

-- Message log: users can view logs for their workspace channels
CREATE POLICY "channel_msg_log_select"
  ON public.channel_message_log FOR SELECT
  USING (channel_id IN (
    SELECT id FROM public.messaging_channels WHERE workspace_id IN (
      SELECT id FROM public.workspaces WHERE owner_id = auth.uid()
    )
  ));
