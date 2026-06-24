-- 036_file_attachments.sql
-- File attachments for tasks and team runs (input + output files)

-- ─── file_attachments ────────────────────────────────────────────────────────

CREATE TABLE public.file_attachments (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id  UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    task_id       UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
    team_run_id   UUID REFERENCES public.team_runs(id) ON DELETE CASCADE,
    direction     TEXT NOT NULL CHECK (direction IN ('input', 'output')),
    file_name     TEXT NOT NULL,
    file_type     TEXT NOT NULL,      -- MIME type e.g. 'text/csv', 'image/png'
    file_size     INTEGER NOT NULL,   -- bytes
    storage_path  TEXT NOT NULL,      -- path within Supabase Storage bucket
    created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- At least one of task_id or team_run_id must be set
    CONSTRAINT chk_attachment_parent
        CHECK (task_id IS NOT NULL OR team_run_id IS NOT NULL)
);

CREATE INDEX idx_file_attachments_task      ON public.file_attachments(task_id);
CREATE INDEX idx_file_attachments_team_run  ON public.file_attachments(team_run_id);
CREATE INDEX idx_file_attachments_workspace ON public.file_attachments(workspace_id);

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.file_attachments ENABLE ROW LEVEL SECURITY;

-- Workspace members can read attachments
CREATE POLICY "Users can view own workspace attachments"
    ON public.file_attachments FOR SELECT
    USING (workspace_id IN (
        SELECT id FROM public.workspaces WHERE owner_id = auth.uid()
        UNION
        SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    ));

-- Workspace members can insert attachments
CREATE POLICY "Users can insert own workspace attachments"
    ON public.file_attachments FOR INSERT
    WITH CHECK (workspace_id IN (
        SELECT id FROM public.workspaces WHERE owner_id = auth.uid()
        UNION
        SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    ));

-- Workspace members can delete their own attachments
CREATE POLICY "Users can delete own workspace attachments"
    ON public.file_attachments FOR DELETE
    USING (workspace_id IN (
        SELECT id FROM public.workspaces WHERE owner_id = auth.uid()
        UNION
        SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    ));

-- Service role (task runner) can read/insert attachments
CREATE POLICY "Service role can read attachments"
    ON public.file_attachments FOR SELECT TO service_role
    USING (true);

CREATE POLICY "Service role can insert attachments"
    ON public.file_attachments FOR INSERT TO service_role
    WITH CHECK (true);

-- ─── Storage bucket ─────────────────────────────────────────────────────────
-- NOTE: Run this in the Supabase SQL editor or dashboard:
--
--   INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
--   VALUES (
--     'attachments',
--     'attachments',
--     false,
--     10485760,  -- 10MB
--     ARRAY[
--       'text/plain', 'text/csv', 'text/markdown', 'text/html',
--       'application/json', 'application/pdf',
--       'image/png', 'image/jpeg', 'image/webp', 'image/gif',
--       'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
--       'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
--     ]
--   );
--
-- Storage RLS policies (run in SQL editor):
--
--   CREATE POLICY "Authenticated users can upload" ON storage.objects
--     FOR INSERT TO authenticated
--     WITH CHECK (bucket_id = 'attachments');
--
--   CREATE POLICY "Authenticated users can read" ON storage.objects
--     FOR SELECT TO authenticated
--     USING (bucket_id = 'attachments');
--
--   CREATE POLICY "Service role full access" ON storage.objects
--     FOR ALL TO service_role
--     USING (bucket_id = 'attachments');
