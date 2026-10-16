-- SPDX-License-Identifier: MIT
-- Copyright (C) 2026 CrewForm
--
-- 007_voice_output_templates.sql — Voice profiles and output templates
-- Tables: voice_profiles, output_templates
-- Also adds FK columns to agents table.

-- ────────────────────────────────────────────────────────────────────────────
-- voice_profiles — reusable tone/style configurations
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.voice_profiles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  tone                TEXT NOT NULL DEFAULT 'formal'
                        CHECK (tone IN ('formal', 'casual', 'technical',
                                        'creative', 'empathetic', 'custom')),
  custom_instructions TEXT,
  output_format_hints TEXT,
  is_template         BOOLEAN NOT NULL DEFAULT false,  -- workspace-level template
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_voice_profiles_workspace ON public.voice_profiles(workspace_id);

CREATE TRIGGER trg_voice_profiles_updated_at
  BEFORE UPDATE ON public.voice_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- output_templates — per-agent output formatting templates
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.output_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  template_type TEXT NOT NULL DEFAULT 'markdown'
                  CHECK (template_type IN ('markdown', 'json', 'html', 'csv', 'custom')),
  body          TEXT NOT NULL DEFAULT '',       -- template body with {{variable}} syntax
  variables     JSONB NOT NULL DEFAULT '[]'::jsonb,  -- variable definitions
  is_builtin    BOOLEAN NOT NULL DEFAULT false, -- pre-built system templates
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_output_templates_workspace ON public.output_templates(workspace_id);

CREATE TRIGGER trg_output_templates_updated_at
  BEFORE UPDATE ON public.output_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- Add FK columns to agents table
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.agents
  ADD COLUMN voice_profile_id   UUID REFERENCES public.voice_profiles(id) ON DELETE SET NULL,
  ADD COLUMN output_template_id UUID REFERENCES public.output_templates(id) ON DELETE SET NULL;
