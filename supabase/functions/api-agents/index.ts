// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { handleCors } from '../_shared/cors.ts';
import { authenticateRequest } from '../_shared/auth.ts';
import { ok, created, noContent, notFound, unauthorized, methodNotAllowed, serverError, badRequest } from '../_shared/response.ts';
import { validateBody, z } from '../_shared/validate.ts';
import { checkRateLimit, tooManyRequests } from '../_shared/rateLimit.ts';

const CreateAgentSchema = z.object({
    name: z.string().min(1).max(100),
    description: z.string().default(''),
    model: z.string().min(1),
    system_prompt: z.string().default('You are a helpful AI assistant.'),
    temperature: z.number().min(0).max(2).default(0.7),
    tools: z.array(z.string()).default([]),
    status: z.enum(['idle', 'busy', 'offline']).default('idle'),
});

const UpdateAgentSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().optional(),
    model: z.string().min(1).optional(),
    system_prompt: z.string().optional(),
    temperature: z.number().min(0).max(2).optional(),
    tools: z.array(z.string()).optional(),
    status: z.enum(['idle', 'busy', 'offline']).optional(),
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
                    // Get single agent
                    const { data, error } = await auth.supabaseClient
                        .from('agents')
                        .select('*')
                        .eq('id', id)
                        .eq('workspace_id', auth.workspaceId)
                        .single();

                    if (error || !data) return notFound('Agent', resOpts);
                    return ok(data, resOpts);
                }

                // List agents — v2 supports cursor-based pagination
                const limit = parseInt(url.searchParams.get('limit') ?? '50', 10);
                const cursor = url.searchParams.get('cursor');

                let query = auth.supabaseClient
                    .from('agents')
                    .select('*')
                    .eq('workspace_id', auth.workspaceId)
                    .order('created_at', { ascending: false })
                    .limit(limit + 1); // fetch one extra to detect "has more"

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
                const result = await validateBody(req, CreateAgentSchema);
                if ('error' in result) return result.error;

                const { data, error } = await auth.supabaseClient
                    .from('agents')
                    .insert({ ...result.data, workspace_id: auth.workspaceId })
                    .select()
                    .single();

                if (error) return serverError(error.message, resOpts);
                return created(data, resOpts);
            }

            case 'PATCH': {
                if (!id) return notFound('Agent (missing id parameter)', resOpts);

                const result = await validateBody(req, UpdateAgentSchema);
                if ('error' in result) return result.error;

                const { data, error } = await auth.supabaseClient
                    .from('agents')
                    .update(result.data)
                    .eq('id', id)
                    .eq('workspace_id', auth.workspaceId)
                    .select()
                    .single();

                if (error) return serverError(error.message, resOpts);
                if (!data) return notFound('Agent', resOpts);
                return ok(data, resOpts);
            }

            case 'DELETE': {
                if (!id) return notFound('Agent (missing id parameter)', resOpts);

                const { error } = await auth.supabaseClient
                    .from('agents')
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
