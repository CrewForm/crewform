-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Copyright (C) 2026 CrewForm
--
-- 082_harden_service_role_rls_policies.sql
--
-- Tighten policies that were intended for trusted backend/service-role writes.
-- Without an explicit TO clause, PostgreSQL policies apply to PUBLIC, which can
-- make Supabase anon/authenticated clients eligible for the policy.

-- Chat widget sessions: workspace members keep the separate read policy;
-- trusted backend writes are limited to service_role.
DROP POLICY IF EXISTS chat_sessions_service_write ON public.chat_sessions;
CREATE POLICY chat_sessions_service_write
  ON public.chat_sessions
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Google OAuth tokens: only service role should read/write token material.
DROP POLICY IF EXISTS "google_connections_service_role" ON public.google_connections;
CREATE POLICY "google_connections_service_role"
  ON public.google_connections
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- File attachment metadata: workspace policies handle user access; service
-- access is limited to the task runner/backend.
DROP POLICY IF EXISTS "Service role can read attachments" ON public.file_attachments;
CREATE POLICY "Service role can read attachments"
  ON public.file_attachments
  FOR SELECT TO service_role
  USING (true);

DROP POLICY IF EXISTS "Service role can insert attachments" ON public.file_attachments;
CREATE POLICY "Service role can insert attachments"
  ON public.file_attachments
  FOR INSERT TO service_role
  WITH CHECK (true);

-- Team memory and knowledge chunks are inserted by backend pipelines.
DROP POLICY IF EXISTS "team_memory_insert_service" ON public.team_memory;
CREATE POLICY "team_memory_insert_service"
  ON public.team_memory
  FOR INSERT TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS "knowledge_chunks_insert" ON public.knowledge_chunks;
CREATE POLICY "knowledge_chunks_insert"
  ON public.knowledge_chunks
  FOR INSERT TO service_role
  WITH CHECK (true);

-- Runner status should not be public. Service-role task runner access bypasses
-- RLS; super admins can still read status for observability.
DROP POLICY IF EXISTS "task_runners_select" ON public.task_runners;
CREATE POLICY "task_runners_select"
  ON public.task_runners
  FOR SELECT TO authenticated
  USING (public.is_super_admin());
