// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { handleCors } from '../_shared/cors.ts';
import { authenticateRequest } from '../_shared/auth.ts';
import { ok, created, noContent, notFound, unauthorized, methodNotAllowed, serverError } from '../_shared/response.ts';
import { validateBody, z } from '../_shared/validate.ts';
import { checkRateLimit, tooManyRequests } from '../_shared/rateLimit.ts';

const CreateTaskSchema = z.object({
    title: z.string().min(1).max(200),
    description: z.string().min(1),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
    assigned_agent_id: z.string().uuid().optional(),
    assigned_team_id: z.string().uuid().optional(),
    metadata: z.record(z.unknown()).default({}),
});

const UpdateTaskSchema = z.object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().optional(),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
    status: z.enum(['pending', 'dispatched', 'running', 'completed', 'failed', 'cancelled']).optional(),
    assigned_agent_id: z.string().uuid().nullable().optional(),
    assigned_team_id: z.string().uuid().nullable().optional(),
    metadata: z.record(z.unknown()).optional(),
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
        const statusFilter = url.searchParams.get('status');

        switch (req.method) {
            case 'GET': {
                if (id) {
                    const { data, error } = await auth.supabaseClient
                        .from('tasks')
                        .select('*')
                        .eq('id', id)
                        .eq('workspace_id', auth.workspaceId)
                        .single();

                    if (error || !data) return notFound('Task', resOpts);
                    return ok(data, resOpts);
                }

                // List tasks — v2 supports cursor-based pagination
                const limit = parseInt(url.searchParams.get('limit') ?? '50', 10);
                const cursor = url.searchParams.get('cursor');

                let query = auth.supabaseClient
                    .from('tasks')
                    .select('*')
                    .eq('workspace_id', auth.workspaceId)
                    .order('created_at', { ascending: false })
                    .limit(limit + 1);

                if (statusFilter) {
                    query = query.eq('status', statusFilter);
                }
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
                const result = await validateBody(req, CreateTaskSchema);
                if ('error' in result) return result.error;

                // Auto-dispatch if an agent or team is assigned
                const shouldDispatch = !!(result.data.assigned_agent_id || result.data.assigned_team_id);

                const { data, error } = await auth.supabaseClient
                    .from('tasks')
                    .insert({
                        ...result.data,
                        workspace_id: auth.workspaceId,
                        created_by: auth.userId,
                        ...(shouldDispatch ? { status: 'dispatched' } : {}),
                    })
                    .select()
                    .single();

                if (error) return serverError(error.message, resOpts);
                return created(data, resOpts);
            }

            case 'PATCH': {
                if (!id) return notFound('Task (missing id parameter)', resOpts);

                const result = await validateBody(req, UpdateTaskSchema);
                if ('error' in result) return result.error;

                const { data, error } = await auth.supabaseClient
                    .from('tasks')
                    .update(result.data)
                    .eq('id', id)
                    .eq('workspace_id', auth.workspaceId)
                    .select()
                    .single();

                if (error) return serverError(error.message, resOpts);
                if (!data) return notFound('Task', resOpts);
                return ok(data, resOpts);
            }

            case 'DELETE': {
                if (!id) return notFound('Task (missing id parameter)', resOpts);

                const { error } = await auth.supabaseClient
                    .from('tasks')
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
