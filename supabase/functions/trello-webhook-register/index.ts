// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

/**
 * Trello Webhook Registration
 *
 * Registers/unregisters Trello webhooks when a Trello messaging channel
 * is created or deleted. Called by the frontend or by channel lifecycle hooks.
 *
 * POST   → Register a webhook for a board
 * DELETE → Unregister a webhook
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors } from '../_shared/cors.ts';
import { ok, serverError, notFound } from '../_shared/response.ts';

interface RegisterBody {
    channel_id: string;
    api_key: string;
    token: string;
    board_id: string;
}

interface UnregisterBody {
    channel_id: string;
    api_key: string;
    token: string;
    webhook_id: string;
}

Deno.serve(async (req: Request) => {
    const cors = handleCors(req);
    if (cors) return cors;

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    try {
        if (req.method === 'POST') {
            const body = (await req.json()) as RegisterBody;
            const { api_key, token, board_id, channel_id } = body;

            if (!api_key || !token || !board_id || !channel_id) {
                return serverError('Missing required fields: api_key, token, board_id, channel_id');
            }

            // The callback URL is this project's channel-trello Edge Function
            const callbackUrl = `${supabaseUrl}/functions/v1/channel-trello`;

            // Register webhook with Trello
            const resp = await fetch(
                `https://api.trello.com/1/webhooks?key=${api_key}&token=${token}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        callbackURL: callbackUrl,
                        idModel: board_id,
                        description: `CrewForm channel ${channel_id}`,
                        active: true,
                    }),
                    signal: AbortSignal.timeout(15000),
                },
            );

            if (!resp.ok) {
                const errorText = await resp.text();
                console.error('[trello-webhook-register] Trello API error:', resp.status, errorText);
                return serverError(`Trello API error (${resp.status}): ${errorText}`);
            }

            const webhook = (await resp.json()) as { id: string };

            // Store the Trello webhook ID in the channel config
            const { data: channel } = await supabase
                .from('messaging_channels')
                .select('config')
                .eq('id', channel_id)
                .single();

            if (channel) {
                const updatedConfig = {
                    ...(channel as { config: Record<string, unknown> }).config,
                    trello_webhook_id: webhook.id,
                };

                await supabase
                    .from('messaging_channels')
                    .update({ config: updatedConfig })
                    .eq('id', channel_id);
            }

            console.log(`[trello-webhook-register] Registered webhook ${webhook.id} for board ${board_id}`);
            return ok({ ok: true, webhook_id: webhook.id });
        }

        if (req.method === 'DELETE') {
            const url = new URL(req.url);
            const webhookId = url.searchParams.get('webhook_id');
            const apiKey = url.searchParams.get('api_key');
            const token = url.searchParams.get('token');

            if (!webhookId || !apiKey || !token) {
                return serverError('Missing required params: webhook_id, api_key, token');
            }

            // Delete webhook from Trello
            const resp = await fetch(
                `https://api.trello.com/1/webhooks/${webhookId}?key=${apiKey}&token=${token}`,
                {
                    method: 'DELETE',
                    signal: AbortSignal.timeout(10000),
                },
            );

            if (!resp.ok && resp.status !== 404) {
                const errorText = await resp.text();
                console.error('[trello-webhook-register] Delete error:', resp.status, errorText);
                return serverError(`Trello API error (${resp.status}): ${errorText}`);
            }

            console.log(`[trello-webhook-register] Deleted webhook ${webhookId}`);
            return ok({ ok: true, deleted: true });
        }

        return notFound('Method not supported');
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[trello-webhook-register] Error:', message);
        return serverError(message);
    }
});
