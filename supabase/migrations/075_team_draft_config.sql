-- Migration: 075_team_draft_config.sql
-- Adds draft_config column for autosave/publish workflow on the canvas.
-- When draft_config IS NOT NULL the team has unpublished canvas changes.

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS draft_config JSONB;

COMMENT ON COLUMN public.teams.draft_config IS
  'Draft team config from canvas autosave. NULL = no pending changes. Copy to config to publish.';
