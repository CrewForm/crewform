-- SPDX-License-Identifier: MIT
-- Copyright (C) 2026 CrewForm
--
-- 014_marketplace_schema.sql — Marketplace columns on agents + installs & reviews

-- ────────────────────────────────────────────────────────────────────────────
-- ALTER agents — add marketplace columns
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS is_published     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS marketplace_tags TEXT[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS install_count    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rating_avg       NUMERIC(2,1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS provider         TEXT;

CREATE INDEX IF NOT EXISTS idx_agents_published
  ON public.agents(is_published) WHERE is_published = true;

CREATE INDEX IF NOT EXISTS idx_agents_marketplace_tags
  ON public.agents USING GIN(marketplace_tags);

-- ────────────────────────────────────────────────────────────────────────────
-- agent_installs — tracks who installed which marketplace agent
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.agent_installs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id            UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  workspace_id        UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  installed_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  source_workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  cloned_agent_id     UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  installed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agent_installs_agent      ON public.agent_installs(agent_id);
CREATE INDEX idx_agent_installs_workspace  ON public.agent_installs(workspace_id);

ALTER TABLE public.agent_installs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_installs_select" ON public.agent_installs
  FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())
  );

CREATE POLICY "agent_installs_insert" ON public.agent_installs
  FOR INSERT WITH CHECK (
    workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())
  );

-- ────────────────────────────────────────────────────────────────────────────
-- agent_reviews — marketplace reviews with 1–5 rating
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.agent_reviews (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating      INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One review per user per agent
  UNIQUE (agent_id, user_id)
);

CREATE INDEX idx_agent_reviews_agent ON public.agent_reviews(agent_id);

CREATE TRIGGER trg_agent_reviews_updated_at
  BEFORE UPDATE ON public.agent_reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.agent_reviews ENABLE ROW LEVEL SECURITY;

-- Anyone can read published agent reviews
CREATE POLICY "agent_reviews_select" ON public.agent_reviews
  FOR SELECT USING (true);

CREATE POLICY "agent_reviews_insert" ON public.agent_reviews
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "agent_reviews_update" ON public.agent_reviews
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "agent_reviews_delete" ON public.agent_reviews
  FOR DELETE USING (user_id = auth.uid());

-- ────────────────────────────────────────────────────────────────────────────
-- Trigger: auto-update agents.rating_avg on review changes
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_agent_rating()
RETURNS TRIGGER AS $$
DECLARE
  target_agent_id UUID;
  avg_rating NUMERIC(2,1);
BEGIN
  -- Determine which agent to update
  IF TG_OP = 'DELETE' THEN
    target_agent_id := OLD.agent_id;
  ELSE
    target_agent_id := NEW.agent_id;
  END IF;

  -- Calculate new average
  SELECT COALESCE(ROUND(AVG(rating)::NUMERIC, 1), 0)
  INTO avg_rating
  FROM public.agent_reviews
  WHERE agent_id = target_agent_id;

  -- Update agent
  UPDATE public.agents
  SET rating_avg = avg_rating
  WHERE id = target_agent_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_agent_reviews_rating
  AFTER INSERT OR UPDATE OR DELETE ON public.agent_reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_agent_rating();
