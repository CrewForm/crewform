-- SPDX-License-Identifier: MIT
-- Copyright (C) 2026 CrewForm
--
-- 006_profiles_usage_audit.sql — User profiles, usage tracking, and audit logs
-- Tables: user_profiles, usage_records, audit_logs

-- ────────────────────────────────────────────────────────────────────────────
-- user_profiles — extended user profile (supplements auth.users)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.user_profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url   TEXT,
  timezone     TEXT NOT NULL DEFAULT 'UTC',
  preferences  JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Auto-create user_profile on signup (extends the existing handle_new_user trigger)
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      SPLIT_PART(NEW.email, '@', 1)
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_profile();

-- ────────────────────────────────────────────────────────────────────────────
-- usage_records — per-event usage tracking (tokens, cost, storage)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.usage_records (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_type    TEXT NOT NULL
                  CHECK (event_type IN ('task_execution', 'team_run', 'api_call',
                                        'storage', 'marketplace_install')),
  tokens_used   INTEGER NOT NULL DEFAULT 0,
  cost_usd      DECIMAL(10,6) DEFAULT 0,
  agent_id      UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  task_id       UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  team_run_id   UUID,                          -- references team_runs(id), nullable
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  recorded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_usage_records_workspace   ON public.usage_records(workspace_id, recorded_at);
CREATE INDEX idx_usage_records_event_type  ON public.usage_records(event_type);

-- ────────────────────────────────────────────────────────────────────────────
-- audit_logs — immutable event log for sensitive actions
-- No UPDATE or DELETE ever. INSERT-only by design.
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.audit_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  actor_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action        TEXT NOT NULL,                 -- e.g. 'agent.created', 'api_key.rotated'
  resource_type TEXT NOT NULL,                 -- e.g. 'agent', 'api_key', 'workspace'
  resource_id   UUID,                          -- ID of the affected resource
  details       JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address    INET,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_workspace_date ON public.audit_logs(workspace_id, created_at DESC);
CREATE INDEX idx_audit_logs_actor          ON public.audit_logs(actor_id);
CREATE INDEX idx_audit_logs_action         ON public.audit_logs(action);
