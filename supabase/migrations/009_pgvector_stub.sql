-- SPDX-License-Identifier: MIT
-- Copyright (C) 2026 CrewForm
--
-- 009_pgvector_stub.sql — Enable pgvector extension and create team_memory stub
-- team_memory is Phase 3 (Agency tier) but we enable the extension
-- and create the table now so the schema is ready.

-- ────────────────────────────────────────────────────────────────────────────
-- Enable pgvector extension
-- ────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- ────────────────────────────────────────────────────────────────────────────
-- team_memory — persistent per-team knowledge store (Phase 3)
-- Uses pgvector for semantic similarity search
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.team_memory (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  run_id      UUID REFERENCES public.team_runs(id) ON DELETE SET NULL,
  content     TEXT NOT NULL,
  embedding   extensions.vector(1536),        -- OpenAI ada-002 / text-embedding-3-small
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_team_memory_team ON public.team_memory(team_id);

-- IVFFlat index for vector similarity search
-- Note: IVFFlat requires data to build the index; for empty tables this
-- is a no-op but the index definition is ready for when data arrives.
CREATE INDEX idx_team_memory_embedding ON public.team_memory
  USING ivfflat (embedding extensions.vector_cosine_ops)
  WITH (lists = 100);

-- ────────────────────────────────────────────────────────────────────────────
-- RLS for team_memory
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.team_memory ENABLE ROW LEVEL SECURITY;

-- Members can read team memory entries via team → workspace membership
CREATE POLICY "team_memory_select" ON public.team_memory
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = team_id
        AND public.is_workspace_member(t.workspace_id)
    )
  );

-- Insert restricted to service role (Task Runner writes memory entries)
