-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Copyright (C) 2026 CrewForm
--
-- 057_abuse_spike_detection.sql
-- Adds RPCs for spike detection (current vs previous window comparison)
-- and key rotation frequency alerts for the abuse dashboard.

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Spike detection: compare current window vs previous window
--    Returns workspaces where current usage is >2x the previous period.
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_usage_spikes(
    p_days INT DEFAULT 7
)
RETURNS TABLE (
    workspace_id     UUID,
    workspace_name   TEXT,
    plan             TEXT,
    suspended_at     TIMESTAMPTZ,
    -- Current window
    curr_tasks       BIGINT,
    curr_runs        BIGINT,
    curr_tokens      BIGINT,
    curr_cost        NUMERIC,
    -- Previous window
    prev_tasks       BIGINT,
    prev_runs        BIGINT,
    prev_tokens      BIGINT,
    prev_cost        NUMERIC,
    -- Multipliers (current / previous, NULL if prev = 0)
    task_spike        NUMERIC,
    run_spike         NUMERIC,
    token_spike       NUMERIC,
    cost_spike        NUMERIC
) AS $$
BEGIN
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Forbidden';
    END IF;

    RETURN QUERY
    WITH current_window AS (
        SELECT
            t.workspace_id AS ws,
            COUNT(*) AS tasks
        FROM public.tasks t
        WHERE t.created_at >= NOW() - (p_days || ' days')::INTERVAL
        GROUP BY t.workspace_id
    ),
    prev_window AS (
        SELECT
            t.workspace_id AS ws,
            COUNT(*) AS tasks
        FROM public.tasks t
        WHERE t.created_at >= NOW() - (p_days * 2 || ' days')::INTERVAL
          AND t.created_at < NOW() - (p_days || ' days')::INTERVAL
        GROUP BY t.workspace_id
    ),
    current_runs AS (
        SELECT
            tr.workspace_id AS ws,
            COUNT(*) AS runs
        FROM public.team_runs tr
        WHERE tr.created_at >= NOW() - (p_days || ' days')::INTERVAL
        GROUP BY tr.workspace_id
    ),
    prev_runs AS (
        SELECT
            tr.workspace_id AS ws,
            COUNT(*) AS runs
        FROM public.team_runs tr
        WHERE tr.created_at >= NOW() - (p_days * 2 || ' days')::INTERVAL
          AND tr.created_at < NOW() - (p_days || ' days')::INTERVAL
        GROUP BY tr.workspace_id
    ),
    current_usage AS (
        SELECT
            u.workspace_id AS ws,
            SUM(u.total_tokens)::BIGINT AS tokens,
            SUM(u.cost_usd) AS cost
        FROM public.usage_records u
        WHERE u.created_at >= NOW() - (p_days || ' days')::INTERVAL
        GROUP BY u.workspace_id
    ),
    prev_usage AS (
        SELECT
            u.workspace_id AS ws,
            SUM(u.total_tokens)::BIGINT AS tokens,
            SUM(u.cost_usd) AS cost
        FROM public.usage_records u
        WHERE u.created_at >= NOW() - (p_days * 2 || ' days')::INTERVAL
          AND u.created_at < NOW() - (p_days || ' days')::INTERVAL
        GROUP BY u.workspace_id
    )
    SELECT
        w.id            AS workspace_id,
        w.name          AS workspace_name,
        w.plan          AS plan,
        w.suspended_at  AS suspended_at,
        COALESCE(cw.tasks, 0)  AS curr_tasks,
        COALESCE(cr.runs, 0)   AS curr_runs,
        COALESCE(cu.tokens, 0) AS curr_tokens,
        COALESCE(cu.cost, 0)   AS curr_cost,
        COALESCE(pw.tasks, 0)  AS prev_tasks,
        COALESCE(pr.runs, 0)   AS prev_runs,
        COALESCE(pu.tokens, 0) AS prev_tokens,
        COALESCE(pu.cost, 0)   AS prev_cost,
        CASE WHEN COALESCE(pw.tasks, 0) > 0
             THEN ROUND(COALESCE(cw.tasks, 0)::NUMERIC / pw.tasks, 1)
             ELSE NULL END AS task_spike,
        CASE WHEN COALESCE(pr.runs, 0) > 0
             THEN ROUND(COALESCE(cr.runs, 0)::NUMERIC / pr.runs, 1)
             ELSE NULL END AS run_spike,
        CASE WHEN COALESCE(pu.tokens, 0) > 0
             THEN ROUND(COALESCE(cu.tokens, 0)::NUMERIC / pu.tokens, 1)
             ELSE NULL END AS token_spike,
        CASE WHEN COALESCE(pu.cost, 0) > 0
             THEN ROUND(COALESCE(cu.cost, 0)::NUMERIC / pu.cost, 1)
             ELSE NULL END AS cost_spike
    FROM public.workspaces w
    LEFT JOIN current_window cw ON cw.ws = w.id
    LEFT JOIN prev_window pw    ON pw.ws = w.id
    LEFT JOIN current_runs cr   ON cr.ws = w.id
    LEFT JOIN prev_runs pr      ON pr.ws = w.id
    LEFT JOIN current_usage cu  ON cu.ws = w.id
    LEFT JOIN prev_usage pu     ON pu.ws = w.id
    WHERE COALESCE(cw.tasks, 0) > 0
       OR COALESCE(cr.runs, 0) > 0
       OR COALESCE(cu.tokens, 0) > 0
    ORDER BY
        GREATEST(
            COALESCE(CASE WHEN pw.tasks > 0  THEN cw.tasks::NUMERIC / pw.tasks  END, 0),
            COALESCE(CASE WHEN pr.runs > 0   THEN cr.runs::NUMERIC / pr.runs    END, 0),
            COALESCE(CASE WHEN pu.cost > 0   THEN cu.cost / pu.cost             END, 0)
        ) DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Key rotation frequency: count key-related audit events per workspace
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_key_rotation_alerts(
    p_days INT DEFAULT 7
)
RETURNS TABLE (
    workspace_id    UUID,
    workspace_name  TEXT,
    plan            TEXT,
    keys_created    BIGINT,
    keys_rotated    BIGINT,
    keys_deleted    BIGINT,
    total_key_ops   BIGINT,
    latest_op_at    TIMESTAMPTZ
) AS $$
BEGIN
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Forbidden';
    END IF;

    RETURN QUERY
    SELECT
        w.id   AS workspace_id,
        w.name AS workspace_name,
        w.plan AS plan,
        COUNT(*) FILTER (WHERE al.action LIKE '%key%created%')  AS keys_created,
        COUNT(*) FILTER (WHERE al.action LIKE '%key%rotated%')  AS keys_rotated,
        COUNT(*) FILTER (WHERE al.action LIKE '%key%deleted%')  AS keys_deleted,
        COUNT(*) AS total_key_ops,
        MAX(al.created_at) AS latest_op_at
    FROM public.audit_logs al
    JOIN public.workspaces w ON w.id = al.workspace_id
    WHERE al.created_at >= NOW() - (p_days || ' days')::INTERVAL
      AND al.action LIKE '%key%'
    GROUP BY w.id, w.name, w.plan
    HAVING COUNT(*) >= 3
    ORDER BY COUNT(*) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
