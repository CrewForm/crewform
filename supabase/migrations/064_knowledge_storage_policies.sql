-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Copyright (C) 2026 CrewForm
--
-- 064_knowledge_storage_policies.sql — Add missing storage RLS policies
-- for the knowledge bucket. Without these, authenticated users cannot
-- upload files via the Supabase JS client (storage.objects RLS blocks them).

-- Authenticated users can upload files to the knowledge bucket
CREATE POLICY "knowledge_bucket_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'knowledge');

-- Authenticated users can read/download files from the knowledge bucket
CREATE POLICY "knowledge_bucket_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'knowledge');

-- Authenticated users can delete their own files from the knowledge bucket
CREATE POLICY "knowledge_bucket_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'knowledge');

-- Service role has full access (used by kb-process edge function)
CREATE POLICY "knowledge_bucket_service_role" ON storage.objects
  FOR ALL TO service_role
  USING (bucket_id = 'knowledge');
