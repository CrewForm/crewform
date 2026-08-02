-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Copyright (C) 2026 CrewForm
--
-- 083_fix_cron_trigger_execution.sql
--
-- Cron trigger execution fixes for existing deployments:
-- - evaluate cron triggers every minute, so minute-level expressions can match
-- - recover trigger-created agent tasks that were queued as pending

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT cron.unschedule('evaluate-cron-triggers')
WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'evaluate-cron-triggers'
);

SELECT cron.schedule(
    'evaluate-cron-triggers',
    '* * * * *',
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

UPDATE public.tasks
   SET status = 'dispatched',
       updated_at = now()
 WHERE status = 'pending'
   AND assigned_agent_id IS NOT NULL
   AND assigned_team_id IS NULL
   AND metadata->>'source' IN ('cron_trigger', 'webhook_trigger');
