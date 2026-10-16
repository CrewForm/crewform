-- SPDX-License-Identifier: MIT
-- Copyright (C) 2026 CrewForm
--
-- 072_kb_enhancements.sql — Knowledge Base: tags, hybrid search, reranking

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Document Tags — for metadata filtering
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.knowledge_documents
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_knowledge_documents_tags
  ON public.knowledge_documents USING GIN (tags);

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Full-text search vector on chunks
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.knowledge_chunks
  ADD COLUMN IF NOT EXISTS tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_tsv
  ON public.knowledge_chunks USING GIN (tsv);

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Updated match_knowledge_chunks — adds tag filtering
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.match_knowledge_chunks(
    p_workspace_id UUID,
    p_document_ids UUID[],
    p_embedding    extensions.vector(1536),
    p_match_count  INT DEFAULT 5,
    p_tags         TEXT[] DEFAULT NULL
)
RETURNS TABLE (
    id           UUID,
    document_id  UUID,
    content      TEXT,
    chunk_index  INT,
    metadata     JSONB,
    similarity   DOUBLE PRECISION
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        kc.id,
        kc.document_id,
        kc.content,
        kc.chunk_index,
        kc.metadata,
        1 - (kc.embedding <=> p_embedding) AS similarity
    FROM public.knowledge_chunks kc
    JOIN public.knowledge_documents kd ON kd.id = kc.document_id
    WHERE kc.workspace_id = p_workspace_id
      AND kc.embedding IS NOT NULL
      AND (p_document_ids IS NULL OR kc.document_id = ANY(p_document_ids))
      AND (p_tags IS NULL OR kd.tags && p_tags)
    ORDER BY kc.embedding <=> p_embedding
    LIMIT p_match_count;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Hybrid search — combines vector similarity + full-text ranking
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.hybrid_search_knowledge(
    p_workspace_id   UUID,
    p_document_ids   UUID[],
    p_embedding      extensions.vector(1536),
    p_query          TEXT,
    p_match_count    INT   DEFAULT 10,
    p_tags           TEXT[] DEFAULT NULL,
    p_vector_weight  FLOAT DEFAULT 0.7,
    p_text_weight    FLOAT DEFAULT 0.3
)
RETURNS TABLE (
    id                UUID,
    document_id       UUID,
    content           TEXT,
    chunk_index       INT,
    metadata          JSONB,
    vector_similarity DOUBLE PRECISION,
    text_rank         DOUBLE PRECISION,
    combined_score    DOUBLE PRECISION
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH vector_results AS (
        SELECT
            kc.id,
            kc.document_id,
            kc.content,
            kc.chunk_index,
            kc.metadata,
            (1 - (kc.embedding <=> p_embedding)) AS vsim
        FROM public.knowledge_chunks kc
        JOIN public.knowledge_documents kd ON kd.id = kc.document_id
        WHERE kc.workspace_id = p_workspace_id
          AND kc.embedding IS NOT NULL
          AND (p_document_ids IS NULL OR kc.document_id = ANY(p_document_ids))
          AND (p_tags IS NULL OR kd.tags && p_tags)
        ORDER BY kc.embedding <=> p_embedding
        LIMIT p_match_count * 3  -- over-fetch for reranking pool
    ),
    text_results AS (
        SELECT
            kc.id,
            ts_rank_cd(kc.tsv, websearch_to_tsquery('english', p_query)) AS trank
        FROM public.knowledge_chunks kc
        WHERE kc.workspace_id = p_workspace_id
          AND kc.tsv @@ websearch_to_tsquery('english', p_query)
          AND (p_document_ids IS NULL OR kc.document_id = ANY(p_document_ids))
    )
    SELECT
        v.id,
        v.document_id,
        v.content,
        v.chunk_index,
        v.metadata,
        v.vsim                AS vector_similarity,
        COALESCE(t.trank, 0)  AS text_rank,
        (v.vsim * p_vector_weight + COALESCE(t.trank, 0) * p_text_weight) AS combined_score
    FROM vector_results v
    LEFT JOIN text_results t ON t.id = v.id
    ORDER BY (v.vsim * p_vector_weight + COALESCE(t.trank, 0) * p_text_weight) DESC
    LIMIT p_match_count;
END;
$$;
