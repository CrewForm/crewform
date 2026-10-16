-- SPDX-License-Identifier: MIT
-- Copyright (C) 2026 CrewForm
--
-- 001_core_schema.sql — Core tables for CrewForm
-- Tables: workspaces, workspace_members, agents, tasks, teams, team_members, api_keys

-- ────────────────────────────────────────────────────────────────────────────
-- Trigger function: auto-update updated_at on row modification
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ────────────────────────────────────────────────────────────────────────────
-- workspaces
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.workspaces (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  owner_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan       TEXT NOT NULL DEFAULT 'free'
               CHECK (plan IN ('free', 'pro', 'team', 'enterprise')),
  settings   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workspaces_owner_id ON public.workspaces(owner_id);
CREATE INDEX idx_workspaces_slug     ON public.workspaces(slug);

CREATE TRIGGER trg_workspaces_updated_at
  BEFORE UPDATE ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- workspace_members
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.workspace_members (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role         TEXT NOT NULL DEFAULT 'member'
                 CHECK (role IN ('owner', 'admin', 'manager', 'member', 'viewer')),
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, user_id)
);

CREATE INDEX idx_workspace_members_workspace_id ON public.workspace_members(workspace_id);
CREATE INDEX idx_workspace_members_user_id      ON public.workspace_members(user_id);

-- ────────────────────────────────────────────────────────────────────────────
-- agents
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.agents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  avatar_url    TEXT,
  model         TEXT NOT NULL,
  system_prompt TEXT NOT NULL DEFAULT '',
  temperature   NUMERIC NOT NULL DEFAULT 0.7
                  CHECK (temperature >= 0 AND temperature <= 2),
  tools         JSONB NOT NULL DEFAULT '[]'::jsonb,
  voice_profile JSONB,
  status        TEXT NOT NULL DEFAULT 'idle'
                  CHECK (status IN ('idle', 'busy', 'offline')),
  config        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agents_workspace_id ON public.agents(workspace_id);

CREATE TRIGGER trg_agents_updated_at
  BEFORE UPDATE ON public.agents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- teams
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.teams (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  mode         TEXT NOT NULL DEFAULT 'pipeline'
                 CHECK (mode IN ('pipeline', 'orchestrator', 'collaboration')),
  config       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_teams_workspace_id ON public.teams(workspace_id);

CREATE TRIGGER trg_teams_updated_at
  BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- team_members
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.team_members (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id  UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  role     TEXT NOT NULL DEFAULT 'worker'
             CHECK (role IN ('orchestrator', 'worker', 'reviewer')),
  position INTEGER NOT NULL DEFAULT 0,
  config   JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (team_id, agent_id)
);

CREATE INDEX idx_team_members_team_id  ON public.team_members(team_id);
CREATE INDEX idx_team_members_agent_id ON public.team_members(agent_id);

-- ────────────────────────────────────────────────────────────────────────────
-- tasks
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.tasks (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  description       TEXT NOT NULL DEFAULT '',
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  priority          TEXT NOT NULL DEFAULT 'medium'
                      CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  assigned_agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  assigned_team_id  UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  result            JSONB,
  error             TEXT,
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tasks_workspace_id      ON public.tasks(workspace_id);
CREATE INDEX idx_tasks_assigned_agent_id ON public.tasks(assigned_agent_id);
CREATE INDEX idx_tasks_assigned_team_id  ON public.tasks(assigned_team_id);
CREATE INDEX idx_tasks_created_by        ON public.tasks(created_by);
CREATE INDEX idx_tasks_status            ON public.tasks(status);

CREATE TRIGGER trg_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- api_keys
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.api_keys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider      TEXT NOT NULL,
  encrypted_key TEXT NOT NULL,
  key_hint      TEXT NOT NULL DEFAULT '',
  is_valid      BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_api_keys_workspace_id ON public.api_keys(workspace_id);

CREATE TRIGGER trg_api_keys_updated_at
  BEFORE UPDATE ON public.api_keys
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
