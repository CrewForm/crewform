-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Copyright (C) 2026 CrewForm
--
-- 041_ee_license.sql — Enterprise Edition license keys per workspace.
-- Stores license keys that unlock EE features for a workspace.
-- The task-runner and frontend read this table to gate enterprise features.

-- ────────────────────────────────────────────────────────────────────────────
-- ee_licenses — one active license per workspace
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.ee_licenses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  license_key   TEXT NOT NULL,
  plan          TEXT NOT NULL DEFAULT 'enterprise',
  features      TEXT[] NOT NULL DEFAULT '{}',
  seats         INT NOT NULL DEFAULT 5,
  valid_from    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until   TIMESTAMPTZ,          -- NULL = perpetual
  status        TEXT NOT NULL DEFAULT 'active',
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_ee_licenses_workspace ON public.ee_licenses(workspace_id)
  WHERE status = 'active';

-- ────────────────────────────────────────────────────────────────────────────
-- RLS — owners/admins can view their license; service role can write
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.ee_licenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ee_licenses_select" ON public.ee_licenses
  FOR SELECT USING (
    public.is_workspace_member(workspace_id)
  );

-- Insert/update restricted to service role (license provisioning API)
