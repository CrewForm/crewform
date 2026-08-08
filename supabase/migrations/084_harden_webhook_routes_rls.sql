-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Copyright (C) 2026 CrewForm
--
-- 084_harden_webhook_routes_rls.sql
--
-- Remove policies that were intended for service-role access but applied to
-- PUBLIC because they omitted an explicit role. The service role bypasses RLS,
-- so replacement policies are unnecessary.

DROP POLICY IF EXISTS "Service role can read routes"
  ON public.output_routes;

DROP POLICY IF EXISTS "Service role can insert webhook logs"
  ON public.webhook_logs;

-- User-facing route management and log access require an authenticated user.
ALTER POLICY "Users can view own workspace routes"
  ON public.output_routes TO authenticated;

ALTER POLICY "Users can insert own workspace routes"
  ON public.output_routes TO authenticated;

ALTER POLICY "Users can update own workspace routes"
  ON public.output_routes TO authenticated;

ALTER POLICY "Users can delete own workspace routes"
  ON public.output_routes TO authenticated;

ALTER POLICY "Users can view own workspace webhook logs"
  ON public.webhook_logs TO authenticated;

-- Restrict table grants to the operations used by the authenticated frontend.
-- Backend task runners continue to use service_role.
REVOKE ALL PRIVILEGES ON TABLE public.output_routes FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.webhook_logs FROM anon;

REVOKE ALL PRIVILEGES ON TABLE public.output_routes FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.output_routes TO authenticated;

REVOKE ALL PRIVILEGES ON TABLE public.webhook_logs FROM authenticated;
GRANT SELECT
  ON TABLE public.webhook_logs TO authenticated;

-- No application component subscribes to route changes. Avoid publishing
-- credential-bearing route configuration through Realtime unnecessarily.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'output_routes'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.output_routes;
  END IF;
END
$$;
