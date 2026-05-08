-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Copyright (C) 2026 CrewForm
--
-- 079_cron_evaluate_schedule.sql — pg_cron job to evaluate triggers serverlessly
--
-- Calls the cron-evaluate Edge Function every 30 minutes via pg_net.
-- This removes the need for the task runner to be always-on for cron evaluation.
--

-- Enable required extensions (idempotent)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ────────────────────────────────────────────────────────────────────────────
-- Schedule: run every 30 minutes
-- ────────────────────────────────────────────────────────────────────────────

-- Remove existing schedule if present (idempotent redeploy)
SELECT cron.unschedule('evaluate-cron-triggers')
WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'evaluate-cron-triggers'
);

SELECT cron.schedule(
    'evaluate-cron-triggers',
    '*/30 * * * *',
    $$
    SELECT extensions.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/cron-evaluate',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
        ),
        body := '{}'::jsonb
    );
    $$
);
