-- SPDX-License-Identifier: MIT
-- Copyright (C) 2026 CrewForm
--
-- 013_rest_api_keys.sql — REST API key auth for external callers

-- ────────────────────────────────────────────────────────────────────────────
-- rest_api_keys — API keys for REST API access (separate from provider keys)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.rest_api_keys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  key_hash      TEXT NOT NULL,                     -- SHA-256 hash of the raw key
  key_prefix    TEXT NOT NULL,                     -- first 8 chars for display (e.g. "cf_abcd1234...")
  permissions   JSONB NOT NULL DEFAULT '{"read": true, "write": true}'::jsonb,
  last_used_at  TIMESTAMPTZ,
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rest_api_keys_workspace ON public.rest_api_keys(workspace_id);
CREATE INDEX idx_rest_api_keys_hash ON public.rest_api_keys(key_hash);

CREATE TRIGGER trg_rest_api_keys_updated_at
  BEFORE UPDATE ON public.rest_api_keys
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- RLS
ALTER TABLE public.rest_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rest_api_keys_select" ON public.rest_api_keys
  FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())
  );

CREATE POLICY "rest_api_keys_insert" ON public.rest_api_keys
  FOR INSERT WITH CHECK (
    workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())
  );

CREATE POLICY "rest_api_keys_delete" ON public.rest_api_keys
  FOR DELETE USING (
    workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin'))
  );
