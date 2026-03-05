-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Copyright (C) 2026 CrewForm
--
-- 043_agent_fallback_model.sql — Add fallback_model column to agents table

ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS fallback_model TEXT DEFAULT NULL;

COMMENT ON COLUMN public.agents.fallback_model IS
  'Optional fallback LLM model. Used if the primary model returns a 400/404 error.';
