// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm
//
// rateLimit.ts — Per-workspace, plan-aware API rate limiting.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from './cors.ts';

// ─── Plan limits (requests per minute) ──────────────────────────────────────

const PLAN_RATE_LIMITS: Record<string, number> = {
    free: 30,
    pro: 120,
    team: 300,
    enterprise: 600,
};

const DEFAULT_LIMIT = 30; // fallback = free tier

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RateLimitResult {
    allowed: boolean;
    limit: number;
    remaining: number;
    resetAt: Date;
}

// ─── Rate limit headers ─────────────────────────────────────────────────────

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
    return {
        'X-RateLimit-Limit': result.limit.toString(),
        'X-RateLimit-Remaining': Math.max(0, result.remaining).toString(),
        'X-RateLimit-Reset': Math.floor(result.resetAt.getTime() / 1000).toString(),
    };
}

// ─── 429 Response ───────────────────────────────────────────────────────────

export function tooManyRequests(result: RateLimitResult, apiVersion: number): Response {
    const retryAfterSec = Math.max(1, Math.ceil((result.resetAt.getTime() - Date.now()) / 1000));

    const body = apiVersion >= 2
        ? {
            error: {
                code: 'rate_limit_exceeded',
                message: `Rate limit exceeded. Try again in ${retryAfterSec} seconds.`,
            },
            meta: { api_version: apiVersion },
        }
        : {
            error: `Rate limit exceeded. Try again in ${retryAfterSec} seconds.`,
        };

    return new Response(JSON.stringify(body), {
        status: 429,
        headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Retry-After': retryAfterSec.toString(),
            ...rateLimitHeaders(result),
        },
    });
}

// ─── Main check ─────────────────────────────────────────────────────────────

/**
 * Check and increment the rate limit counter for a workspace.
 * Uses a 1-minute sliding window stored in `api_rate_limits` table.
 */
export async function checkRateLimit(
    workspaceId: string,
    plan: string,
    perKeyOverride?: number | null,
): Promise<RateLimitResult> {
    const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Determine the limit — per-key override takes precedence
    const limit = perKeyOverride ?? PLAN_RATE_LIMITS[plan] ?? DEFAULT_LIMIT;

    // Window = current minute (truncated to minute boundary)
    const now = new Date();
    const windowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes(), 0, 0);
    const resetAt = new Date(windowStart.getTime() + 60_000); // next minute

    try {
        const { data, error } = await supabase.rpc('api_rate_limit_check', {
            p_workspace_id: workspaceId,
            p_window_start: windowStart.toISOString(),
            p_max_requests: limit,
        });

        if (error) {
            // On error, allow the request (fail-open) but log
            console.error('[rateLimit] RPC error:', error.message);
            return { allowed: true, limit, remaining: limit, resetAt };
        }

        const row = (data as Array<{ current_count: number; allowed: boolean }>)?.[0];
        if (!row) {
            return { allowed: true, limit, remaining: limit, resetAt };
        }

        return {
            allowed: row.allowed,
            limit,
            remaining: Math.max(0, limit - row.current_count),
            resetAt,
        };
    } catch (err) {
        // Fail-open on unexpected errors
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[rateLimit] Unexpected error:', msg);
        return { allowed: true, limit, remaining: limit, resetAt };
    }
}
