// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { handleCors } from '../_shared/cors.ts';
import { authenticateRequest } from '../_shared/auth.ts';
import { ok, created, notFound, unauthorized, methodNotAllowed, serverError } from '../_shared/response.ts';
import { validateBody, z } from '../_shared/validate.ts';
import { checkRateLimit, tooManyRequests } from '../_shared/rateLimit.ts';

const CreateRunSchema = z.object({
    team_id: z.string().uuid(),
    input_task: z.string().min(1),
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
        const teamId = url.searchParams.get('team_id');

        switch (req.method) {
            case 'GET': {
                if (id) {
                    // Get single run with messages
                    const [runResult, messagesResult] = await Promise.all([
                        auth.supabaseClient
                            .from('team_runs')
                            .select('*')
                            .eq('id', id)
                            .eq('workspace_id', auth.workspaceId)
                            .single(),
                        auth.supabaseClient
                            .from('team_messages')
                            .select('*')
                            .eq('run_id', id)
                            .order('created_at', { ascending: true }),
                    ]);

                    if (runResult.error || !runResult.data) return notFound('Team run', resOpts);

                    return ok({
                        ...runResult.data,
                        messages: messagesResult.data ?? [],
                    }, resOpts);
                }

                // List runs — v2 supports cursor-based pagination
                const limit = parseInt(url.searchParams.get('limit') ?? '50', 10);
                const cursor = url.searchParams.get('cursor');

                let query = auth.supabaseClient
                    .from('team_runs')
                    .select('*')
                    .eq('workspace_id', auth.workspaceId)
                    .order('created_at', { ascending: false })
                    .limit(limit + 1);

                if (teamId) {
                    query = query.eq('team_id', teamId);
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
                const result = await validateBody(req, CreateRunSchema);
                if ('error' in result) return result.error;

                // Verify team exists and belongs to workspace
                const { data: team, error: teamError } = await auth.supabaseClient
                    .from('teams')
                    .select('id')
                    .eq('id', result.data.team_id)
                    .eq('workspace_id', auth.workspaceId)
                    .single();

                if (teamError || !team) return notFound('Team', resOpts);

                // Create pending run (Task Runner will pick it up)
                const { data, error } = await auth.supabaseClient
                    .from('team_runs')
                    .insert({
                        team_id: result.data.team_id,
                        workspace_id: auth.workspaceId,
                        input_task: result.data.input_task,
                        status: 'pending',
                        created_by: auth.userId,
                    })
                    .select()
                    .single();

                if (error) return serverError(error.message, resOpts);
                return created(data, resOpts);
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
