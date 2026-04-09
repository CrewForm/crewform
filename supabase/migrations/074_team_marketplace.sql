-- 074_team_marketplace.sql
-- Add marketplace support for teams: publish, install, review

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Add marketplace columns to teams (mirrors agents)
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS is_published       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS marketplace_tags   TEXT[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS install_count      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rating_avg         NUMERIC(2,1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS marketplace_readme TEXT;

CREATE INDEX IF NOT EXISTS idx_teams_published
  ON public.teams(is_published) WHERE is_published = true;

CREATE INDEX IF NOT EXISTS idx_teams_marketplace_tags
  ON public.teams USING GIN(marketplace_tags);

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Update marketplace_submissions to support teams
-- ────────────────────────────────────────────────────────────────────────────

-- Make agent_id nullable (submissions can now be for teams)
ALTER TABLE public.marketplace_submissions
  ALTER COLUMN agent_id DROP NOT NULL;

-- Add team_id column
ALTER TABLE public.marketplace_submissions
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_marketplace_submissions_team
  ON public.marketplace_submissions(team_id);

-- Ensure each submission references either an agent or a team (not both, not neither)
ALTER TABLE public.marketplace_submissions
  ADD CONSTRAINT chk_submission_target
  CHECK (
    (agent_id IS NOT NULL AND team_id IS NULL) OR
    (agent_id IS NULL AND team_id IS NOT NULL)
  );

-- ────────────────────────────────────────────────────────────────────────────
-- 3. team_installs — tracks who installed which marketplace team
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.team_installs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id             UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  workspace_id        UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  installed_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  source_workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  cloned_team_id      UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  installed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_team_installs_team      ON public.team_installs(team_id);
CREATE INDEX idx_team_installs_workspace ON public.team_installs(workspace_id);

ALTER TABLE public.team_installs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team_installs_select" ON public.team_installs
  FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())
  );

CREATE POLICY "team_installs_insert" ON public.team_installs
  FOR INSERT WITH CHECK (
    workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())
  );

-- ────────────────────────────────────────────────────────────────────────────
-- 4. team_reviews — marketplace reviews with 1–5 rating
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.team_reviews (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id      UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating       INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text  TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One review per user per team
  UNIQUE (team_id, user_id)
);

CREATE INDEX idx_team_reviews_team ON public.team_reviews(team_id);

CREATE TRIGGER trg_team_reviews_updated_at
  BEFORE UPDATE ON public.team_reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.team_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team_reviews_select" ON public.team_reviews
  FOR SELECT USING (true);

CREATE POLICY "team_reviews_insert" ON public.team_reviews
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "team_reviews_update" ON public.team_reviews
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "team_reviews_delete" ON public.team_reviews
  FOR DELETE USING (user_id = auth.uid());

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Trigger: auto-update teams.rating_avg on review changes
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_team_rating()
RETURNS TRIGGER AS $$
DECLARE
  target_team_id UUID;
  avg_rating NUMERIC(2,1);
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_team_id := OLD.team_id;
  ELSE
    target_team_id := NEW.team_id;
  END IF;

  SELECT COALESCE(ROUND(AVG(rating)::NUMERIC, 1), 0)
  INTO avg_rating
  FROM public.team_reviews
  WHERE team_id = target_team_id;

  UPDATE public.teams
  SET rating_avg = avg_rating
  WHERE id = target_team_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_team_reviews_rating
  AFTER INSERT OR UPDATE OR DELETE ON public.team_reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_team_rating();

-- ────────────────────────────────────────────────────────────────────────────
-- 6. RPC: increment_team_install_count (used by installTeam)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.increment_team_install_count(team_row_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE public.teams
  SET install_count = install_count + 1
  WHERE id = team_row_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
