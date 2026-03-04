-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Copyright (C) 2026 CrewForm
--
-- 042_agent_max_tokens_tags.sql — Add max_tokens and tags to agents

ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS max_tokens INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.agents.max_tokens IS 'Maximum response tokens. NULL means unlimited (provider default).';
COMMENT ON COLUMN public.agents.tags IS 'User-defined tags for categorization and search.';
