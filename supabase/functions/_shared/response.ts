// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { corsHeaders } from './cors.ts';
import type { RateLimitResult } from './rateLimit.ts';
import { rateLimitHeaders } from './rateLimit.ts';

// ─── v2 meta helper ─────────────────────────────────────────────────────────

function buildMeta(apiVersion: number): Record<string, unknown> {
    return {
        api_version: apiVersion,
        request_id: `req_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
        timestamp: new Date().toISOString(),
    };
}

// ─── Response options ───────────────────────────────────────────────────────

interface ResponseOptions {
    apiVersion?: number;
    rateLimit?: RateLimitResult;
}

function buildHeaders(opts?: ResponseOptions): Record<string, string> {
    return {
        ...corsHeaders,
        'Content-Type': 'application/json',
        ...(opts?.rateLimit ? rateLimitHeaders(opts.rateLimit) : {}),
    };
}

function wrapBody(data: unknown, opts?: ResponseOptions): string {
    if (opts?.apiVersion && opts.apiVersion >= 2) {
        return JSON.stringify({ data, meta: buildMeta(opts.apiVersion) });
    }
    return JSON.stringify(data);
}

function wrapError(message: string, code: string, details: unknown, opts?: ResponseOptions): string {
    if (opts?.apiVersion && opts.apiVersion >= 2) {
        return JSON.stringify({
            error: { code, message, ...(details ? { details } : {}) },
            meta: buildMeta(opts.apiVersion),
        });
    }
    return JSON.stringify({ error: message, ...(details ? { details } : {}) });
}

// ─── Success responses ──────────────────────────────────────────────────────

/** 200 OK with JSON body */
export function ok(data: unknown, opts?: ResponseOptions): Response {
    return new Response(wrapBody(data, opts), {
        status: 200,
        headers: buildHeaders(opts),
    });
}

/** 201 Created with JSON body */
export function created(data: unknown, opts?: ResponseOptions): Response {
    return new Response(wrapBody(data, opts), {
        status: 201,
        headers: buildHeaders(opts),
    });
}

/** 204 No Content */
export function noContent(opts?: ResponseOptions): Response {
    return new Response(null, {
        status: 204,
        headers: {
            ...corsHeaders,
            ...(opts?.rateLimit ? rateLimitHeaders(opts.rateLimit) : {}),
        },
    });
}

// ─── Error responses ────────────────────────────────────────────────────────

/** 400 Bad Request */
export function badRequest(message: string, details?: unknown, opts?: ResponseOptions): Response {
    return new Response(wrapError(message, 'bad_request', details, opts), {
        status: 400,
        headers: buildHeaders(opts),
    });
}

/** 401 Unauthorized */
export function unauthorized(message: string, opts?: ResponseOptions): Response {
    return new Response(wrapError(message, 'unauthorized', undefined, opts), {
        status: 401,
        headers: buildHeaders(opts),
    });
}

/** 404 Not Found */
export function notFound(resource: string, opts?: ResponseOptions): Response {
    return new Response(wrapError(`${resource} not found`, 'not_found', undefined, opts), {
        status: 404,
        headers: buildHeaders(opts),
    });
}

/** 405 Method Not Allowed */
export function methodNotAllowed(opts?: ResponseOptions): Response {
    return new Response(wrapError('Method not allowed', 'method_not_allowed', undefined, opts), {
        status: 405,
        headers: buildHeaders(opts),
    });
}

/** 500 Internal Server Error */
export function serverError(message: string, opts?: ResponseOptions): Response {
    return new Response(wrapError(message, 'internal_error', undefined, opts), {
        status: 500,
        headers: buildHeaders(opts),
    });
}
