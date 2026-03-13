// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

/**
 * API Hooks — Zapier REST Hook subscribe / unsubscribe endpoint.
 *
 * POST   — Subscribe: creates a zapier_subscription row
 * DELETE — Unsubscribe: removes a zapier_subscription row by id
 *
 * Auth: X-API-Key header (existing REST API key auth)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors } from '../_shared/cors.ts';
import { authenticateRequest } from '../_shared/auth.ts';
import { ok, created, noContent, badRequest, notFound, unauthorized, methodNotAllowed, serverError } from '../_shared/response.ts';
import { validateBody, z } from '../_shared/validate.ts';
import { checkRateLimit, tooManyRequests } from '../_shared/rateLimit.ts';

const SubscribeSchema = z.object({
    target_url: z.string().url(),
    event: z.string().min(1),
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

        switch (req.method) {
            case 'GET': {
                // List active subscriptions (useful for debugging)
                const { data, error } = await auth.supabaseClient
                    .from('zapier_subscriptions')
                    .select('*')
                    .eq('workspace_id', auth.workspaceId)
                    .order('created_at', { ascending: false });

                if (error) return serverError(error.message, resOpts);
                return ok(data, resOpts);
            }

            case 'POST': {
                // Subscribe — Zapier sends { target_url, event }
                const result = await validateBody(req, SubscribeSchema);
                if ('error' in result) return result.error;

                // Find the API key ID used for this request (for cleanup on key deletion)
                const apiKeyHeader = req.headers.get('X-API-Key');
                let apiKeyId: string | null = null;

                if (apiKeyHeader) {
                    const serviceUrl = Deno.env.get('SUPABASE_URL')!;
                    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
                    const serviceClient = createClient(serviceUrl, serviceKey);

                    const encoder = new TextEncoder();
                    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(apiKeyHeader));
                    const hashArray = Array.from(new Uint8Array(hashBuffer));
                    const keyHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

                    const { data: keyRecord } = await serviceClient
                        .from('rest_api_keys')
                        .select('id')
                        .eq('key_hash', keyHash)
                        .limit(1)
                        .single();

                    if (keyRecord) {
                        apiKeyId = (keyRecord as { id: string }).id;
                    }
                }

                const { data, error } = await auth.supabaseClient
                    .from('zapier_subscriptions')
                    .insert({
                        workspace_id: auth.workspaceId,
                        event: result.data.event,
                        target_url: result.data.target_url,
                        api_key_id: apiKeyId,
                    })
                    .select()
                    .single();

                if (error) return serverError(error.message, resOpts);
                return created(data, resOpts);
            }

            case 'DELETE': {
                // Unsubscribe — Zapier sends subscription ID
                const id = url.searchParams.get('id');
                if (!id) return badRequest('Missing id parameter', undefined, resOpts);

                const { error } = await auth.supabaseClient
                    .from('zapier_subscriptions')
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
