-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Copyright (C) 2026 CrewForm
--
-- 040_team_memory_search.sql — Vector similarity search function and delete policy

-- ────────────────────────────────────────────────────────────────────────────
-- match_team_memories — returns top-K memories by cosine similarity
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.match_team_memories(
    p_team_id   UUID,
    p_embedding extensions.vector(1536),
    p_match_count INT DEFAULT 5
)
RETURNS TABLE (
    id          UUID,
    team_id     UUID,
    run_id      UUID,
    content     TEXT,
    metadata    JSONB,
    similarity  DOUBLE PRECISION,
    created_at  TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        tm.id,
        tm.team_id,
        tm.run_id,
        tm.content,
        tm.metadata,
        1 - (tm.embedding <=> p_embedding) AS similarity,
        tm.created_at
    FROM public.team_memory tm
    WHERE tm.team_id = p_team_id
      AND tm.embedding IS NOT NULL
    ORDER BY tm.embedding <=> p_embedding
    LIMIT p_match_count;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- DELETE policy — workspace members can delete team memory entries
-- ────────────────────────────────────────────────────────────────────────────

CREATE POLICY "team_memory_delete" ON public.team_memory
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = team_id
        AND public.is_workspace_member(t.workspace_id)
    )
  );

-- ────────────────────────────────────────────────────────────────────────────
-- INSERT policy for service role (task runner)
-- Service role bypasses RLS, but explicit policy for clarity
-- ────────────────────────────────────────────────────────────────────────────

CREATE POLICY "team_memory_insert_service" ON public.team_memory
  FOR INSERT WITH CHECK (true);
