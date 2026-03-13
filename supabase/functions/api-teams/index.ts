// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { handleCors } from '../_shared/cors.ts';
import { authenticateRequest } from '../_shared/auth.ts';
import { ok, created, noContent, notFound, unauthorized, methodNotAllowed, serverError } from '../_shared/response.ts';
import { validateBody, z } from '../_shared/validate.ts';
import { checkRateLimit, tooManyRequests } from '../_shared/rateLimit.ts';

const CreateTeamSchema = z.object({
    name: z.string().min(1).max(100),
    description: z.string().default(''),
    mode: z.enum(['pipeline', 'orchestrator', 'collaboration']).default('pipeline'),
    config: z.object({
        steps: z.array(z.object({
            agent_id: z.string().uuid(),
            step_name: z.string().min(1),
            instructions: z.string().default(''),
            expected_output: z.string().default(''),
            on_failure: z.enum(['retry', 'stop', 'skip']).default('stop'),
            max_retries: z.number().int().min(0).max(10).default(1),
        })).default([]),
        auto_handoff: z.boolean().default(true),
    }).default({ steps: [], auto_handoff: true }),
});

const UpdateTeamSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().optional(),
    mode: z.enum(['pipeline', 'orchestrator', 'collaboration']).optional(),
    config: z.object({
        steps: z.array(z.object({
            agent_id: z.string().uuid(),
            step_name: z.string().min(1),
            instructions: z.string().default(''),
            expected_output: z.string().default(''),
            on_failure: z.enum(['retry', 'stop', 'skip']).default('stop'),
            max_retries: z.number().int().min(0).max(10).default(1),
        })),
        auto_handoff: z.boolean(),
    }).optional(),
});

Deno.serve(async (req: Request) => {
    const cors = handleCors(req);
    if (cors) return cors;

    try {
        const auth = await authenticateRequest(req);
        const opts = { apiVersion: auth.apiVersion };

        // Rate limiting
        const rl = await checkRateLimit(auth.workspaceId, auth.plan, auth.apiKeyRateLimit);
        if (!rl.allowed) return tooManyRequests(rl, auth.apiVersion);
        const resOpts = { ...opts, rateLimit: rl };

        const url = new URL(req.url);
        const id = url.searchParams.get('id');

        switch (req.method) {
            case 'GET': {
                if (id) {
                    const { data, error } = await auth.supabaseClient
                        .from('teams')
                        .select('*, team_members(agent_id, role)')
                        .eq('id', id)
                        .eq('workspace_id', auth.workspaceId)
                        .single();

                    if (error || !data) return notFound('Team', resOpts);
                    return ok(data, resOpts);
                }

                // List teams — v2 supports cursor-based pagination
                const limit = parseInt(url.searchParams.get('limit') ?? '50', 10);
                const cursor = url.searchParams.get('cursor');

                let query = auth.supabaseClient
                    .from('teams')
                    .select('*, team_members(agent_id, role)')
                    .eq('workspace_id', auth.workspaceId)
                    .order('created_at', { ascending: false })
                    .limit(limit + 1);

                if (cursor) {
                    query = query.lt('created_at', cursor);
                }

                const { data, error } = await query;
                if (error) return serverError(error.message, resOpts);

                const items = data as Array<Record<string, unknown>>;
                const hasMore = items.length > limit;
                const page = hasMore ? items.slice(0, limit) : items;
                const nextCursor = hasMore ? (page[page.length - 1].created_at as string) : null;

                if (auth.apiVersion >= 2) {
                    return ok({ items: page, next_cursor: nextCursor, has_more: hasMore }, resOpts);
                }
                return ok(page, resOpts);
            }

            case 'POST': {
                const result = await validateBody(req, CreateTeamSchema);
                if ('error' in result) return result.error;

                const { data, error } = await auth.supabaseClient
                    .from('teams')
                    .insert({
                        ...result.data,
                        workspace_id: auth.workspaceId,
                        created_by: auth.userId,
                    })
                    .select()
                    .single();

                if (error) return serverError(error.message, resOpts);
                return created(data, resOpts);
            }

            case 'PATCH': {
                if (!id) return notFound('Team (missing id parameter)', resOpts);

                const result = await validateBody(req, UpdateTeamSchema);
                if ('error' in result) return result.error;

                const { data, error } = await auth.supabaseClient
                    .from('teams')
                    .update(result.data)
                    .eq('id', id)
                    .eq('workspace_id', auth.workspaceId)
                    .select()
                    .single();

                if (error) return serverError(error.message, resOpts);
                if (!data) return notFound('Team', resOpts);
                return ok(data, resOpts);
            }

            case 'DELETE': {
                if (!id) return notFound('Team (missing id parameter)', resOpts);

                const { error } = await auth.supabaseClient
                    .from('teams')
                    .delete()
                    .eq('id', id)
                    .eq('workspace_id', auth.workspaceId);

                if (error) return serverError(error.message, resOpts);
                return noContent(resOpts);
            }

            default:
                return methodNotAllowed(resOpts);
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('authentication') || message.includes('JWT') || message.includes('API key') || message.includes('Invalid')) {
            return unauthorized(message);
        }
        return serverError(message);
    }
});
