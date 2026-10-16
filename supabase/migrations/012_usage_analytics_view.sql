-- SPDX-License-Identifier: MIT
-- Copyright (C) 2026 CrewForm
--
-- 012_usage_analytics_view.sql — Materialized view for daily usage analytics

-- ────────────────────────────────────────────────────────────────────────────
-- usage_daily_summary — pre-aggregated daily usage stats
-- ────────────────────────────────────────────────────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS public.usage_daily_summary AS
SELECT
    DATE(recorded_at)                    AS day,
    workspace_id,
    event_type,
    COUNT(*)::INTEGER                    AS record_count,
    SUM(tokens_used)::INTEGER            AS total_tokens,
    SUM(cost_usd)::DECIMAL(12,6)         AS total_cost
FROM public.usage_records
GROUP BY DATE(recorded_at), workspace_id, event_type
ORDER BY day DESC;

-- Unique index required for concurrent refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_daily_summary_unique
    ON public.usage_daily_summary (day, workspace_id, event_type);

-- Regular index for workspace queries
CREATE INDEX IF NOT EXISTS idx_usage_daily_summary_workspace
    ON public.usage_daily_summary (workspace_id, day DESC);

-- ────────────────────────────────────────────────────────────────────────────
-- refresh_usage_summary() — callable via RPC or cron
-- Uses CONCURRENTLY so reads aren't blocked during refresh
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.refresh_usage_summary()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.usage_daily_summary;
END;
$$;
