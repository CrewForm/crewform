-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Copyright (C) 2026 CrewForm
--
-- 039_managed_bot_connect.sql — Managed bot support with /connect codes
--

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Add managed bot columns to messaging_channels
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.messaging_channels
  ADD COLUMN IF NOT EXISTS is_managed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS connect_code TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS platform_chat_id TEXT;

-- Index for fast lookup by connect code
CREATE INDEX IF NOT EXISTS idx_messaging_channels_connect_code
  ON public.messaging_channels(connect_code) WHERE connect_code IS NOT NULL;

-- Index for fast lookup by platform + chat ID (managed mode routing)
CREATE INDEX IF NOT EXISTS idx_messaging_channels_platform_chat
  ON public.messaging_channels(platform, platform_chat_id) WHERE platform_chat_id IS NOT NULL;
