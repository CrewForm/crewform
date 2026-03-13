-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Copyright (C) 2026 CrewForm
--
-- 048_api_rate_limits.sql — Per-workspace API rate limiting with sliding window.
-- Used by the _shared/rateLimit.ts helper in Edge Functions.

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Rate limit counters — one row per workspace per minute window
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.api_rate_limits (
    workspace_id  UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    window_start  TIMESTAMPTZ NOT NULL,
    request_count INT NOT NULL DEFAULT 1,
    PRIMARY KEY (workspace_id, window_start)
);

-- Fast cleanup of old windows
CREATE INDEX idx_api_rate_limits_cleanup ON public.api_rate_limits(window_start);

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Atomic increment-and-return function (avoids race conditions)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.api_rate_limit_check(
    p_workspace_id UUID,
    p_window_start TIMESTAMPTZ,
    p_max_requests INT
)
RETURNS TABLE (
    current_count INT,
    allowed BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    v_count INT;
BEGIN
    -- Upsert: increment counter or insert new row
    INSERT INTO public.api_rate_limits (workspace_id, window_start, request_count)
    VALUES (p_workspace_id, p_window_start, 1)
    ON CONFLICT (workspace_id, window_start)
    DO UPDATE SET request_count = api_rate_limits.request_count + 1
    RETURNING api_rate_limits.request_count INTO v_count;

    RETURN QUERY SELECT v_count, v_count <= p_max_requests;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Cleanup function — call periodically to clear old windows
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.api_rate_limit_cleanup()
RETURNS void
LANGUAGE sql SECURITY DEFINER
AS $$
    DELETE FROM public.api_rate_limits
    WHERE window_start < NOW() - INTERVAL '1 hour';
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Optional per-key rate limit override on rest_api_keys
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.rest_api_keys
    ADD COLUMN IF NOT EXISTS rate_limit_per_min INT DEFAULT NULL;

COMMENT ON COLUMN public.rest_api_keys.rate_limit_per_min IS
    'Per-key rate limit override (requests/minute). NULL = use plan default.';
