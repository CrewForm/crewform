-- SPDX-License-Identifier: MIT
-- Copyright (C) 2026 CrewForm
--
-- 011_team_run_executor.sql — Team run claiming RPC + Realtime enablement
--

-- ────────────────────────────────────────────────────────────────────────────
-- claim_next_team_run — atomically claim the oldest pending team_run
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.claim_next_team_run()
RETURNS SETOF public.team_runs
LANGUAGE plpgsql
AS $$
DECLARE
  claimed public.team_runs;
BEGIN
  SELECT *
    INTO claimed
    FROM public.team_runs
   WHERE status = 'pending'
   ORDER BY created_at ASC
   LIMIT 1
     FOR UPDATE SKIP LOCKED;

  IF claimed.id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.team_runs
     SET status     = 'running',
         started_at = NOW()
   WHERE id = claimed.id;

  claimed.status     := 'running';
  claimed.started_at := NOW();

  RETURN NEXT claimed;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- Enable Supabase Realtime on team execution tables
-- ────────────────────────────────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE public.team_runs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.team_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.team_handoffs;
