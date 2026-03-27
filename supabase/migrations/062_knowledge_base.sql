-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Copyright (C) 2026 CrewForm
--
-- 062_knowledge_base.sql — RAG / Knowledge Base tables
-- Document upload → chunking → embedding → vector search

-- ────────────────────────────────────────────────────────────────────────────
-- knowledge_documents — uploaded file metadata
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.knowledge_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  file_name     TEXT NOT NULL,
  file_type     TEXT NOT NULL,
  file_size     INT NOT NULL DEFAULT 0,
  storage_path  TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'processing', 'ready', 'error')),
  error_message TEXT,
  chunk_count   INT NOT NULL DEFAULT 0,
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_knowledge_documents_workspace ON public.knowledge_documents(workspace_id);

CREATE TRIGGER trg_knowledge_documents_updated_at
  BEFORE UPDATE ON public.knowledge_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- knowledge_chunks — embedded text chunks
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.knowledge_chunks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   UUID NOT NULL REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
  workspace_id  UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  content       TEXT NOT NULL,
  chunk_index   INT NOT NULL,
  embedding     extensions.vector(1536),
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_knowledge_chunks_document ON public.knowledge_chunks(document_id);
CREATE INDEX idx_knowledge_chunks_workspace ON public.knowledge_chunks(workspace_id);

-- IVFFlat index for vector similarity search
CREATE INDEX idx_knowledge_chunks_embedding ON public.knowledge_chunks
  USING ivfflat (embedding extensions.vector_cosine_ops)
  WITH (lists = 100);

-- ────────────────────────────────────────────────────────────────────────────
-- match_knowledge_chunks — cosine similarity search
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.match_knowledge_chunks(
    p_workspace_id UUID,
    p_document_ids UUID[],
    p_embedding    extensions.vector(1536),
    p_match_count  INT DEFAULT 5
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
    WHERE kc.workspace_id = p_workspace_id
      AND kc.embedding IS NOT NULL
      AND (p_document_ids IS NULL OR kc.document_id = ANY(p_document_ids))
    ORDER BY kc.embedding <=> p_embedding
    LIMIT p_match_count;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- RLS — knowledge_documents
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.knowledge_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "knowledge_documents_select" ON public.knowledge_documents
  FOR SELECT USING (public.is_workspace_member(workspace_id));

CREATE POLICY "knowledge_documents_insert" ON public.knowledge_documents
  FOR INSERT WITH CHECK (public.is_workspace_member(workspace_id));

CREATE POLICY "knowledge_documents_update" ON public.knowledge_documents
  FOR UPDATE USING (public.is_workspace_member(workspace_id));

CREATE POLICY "knowledge_documents_delete" ON public.knowledge_documents
  FOR DELETE USING (public.is_workspace_member(workspace_id));

-- ────────────────────────────────────────────────────────────────────────────
-- RLS — knowledge_chunks
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "knowledge_chunks_select" ON public.knowledge_chunks
  FOR SELECT USING (public.is_workspace_member(workspace_id));

-- Insert/delete by service role (processing pipeline) — service role bypasses RLS
CREATE POLICY "knowledge_chunks_insert" ON public.knowledge_chunks
  FOR INSERT WITH CHECK (true);

CREATE POLICY "knowledge_chunks_delete" ON public.knowledge_chunks
  FOR DELETE USING (public.is_workspace_member(workspace_id));

-- ────────────────────────────────────────────────────────────────────────────
-- Enable Realtime for status updates
-- ────────────────────────────────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE public.knowledge_documents;

-- ────────────────────────────────────────────────────────────────────────────
-- Create storage bucket for knowledge base files
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('knowledge', 'knowledge', false)
ON CONFLICT (id) DO NOTHING;
