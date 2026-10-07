// SPDX-License-Identifier: AGPL-3.0-or-later
import { safeRemoteFetch } from '../_shared/urlSafety.ts';
import { readJson } from '../_shared/body.ts';
// Copyright (C) 2026 CrewForm

/**
 * Webhook Test Edge Function
 *
 * Sends a test payload to a configured output route to verify it is working.
 * Called from the frontend "Send Test" button.
 *
 * Auth: Supabase JWT (user must own the workspace).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors } from '../_shared/cors.ts';
import { authenticateRequest } from '../_shared/auth.ts';
import { ok, badRequest, notFound, unauthorized, serverError, methodNotAllowed } from '../_shared/response.ts';

// ─── Types ──────────────────────────────────────────────────────────────────

interface OutputRoute {
    id: string;
    workspace_id: string;
    name: string;
    destination_type: string;
    config: Record<string, unknown>;
    events: string[];
    is_active: boolean;
}

// ─── Main Handler ───────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
    const cors = handleCors(req);
    if (cors) return cors;

    if (req.method !== 'POST') {
        return methodNotAllowed();
    }

    try {
        // ── Auth (shared helper — supports JWT + API key) ────────────
        const auth = await authenticateRequest(req);

        // ── Parse body ──────────────────────────────────────────────────
        const body = (await readJson(req)) as { route_id?: string };
        if (!body.route_id) {
            return badRequest('Missing route_id');
        }

        // ── Fetch route using service role ──────────────────────────────
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

        const { data: route, error: routeError } = await serviceClient
            .from('output_routes')
            .select('*')
            .eq('id', body.route_id)
            .eq('workspace_id', auth.workspaceId)
            .single();

        if (routeError || !route) {
            return notFound('Output route');
        }

        const routeRecord = route as OutputRoute;

        // ── Build test payload ──────────────────────────────────────────
        const testPayload = {
            event: 'webhook.test',
            task_id: null,
            team_run_id: null,
            task_title: 'Test Webhook Delivery',
            agent_name: 'CrewForm Test',
            status: 'test',
            result_preview: 'This is a test payload from CrewForm to verify your webhook endpoint is working correctly.',
            error: null,
            timestamp: new Date().toISOString(),
        };

        // ── Deliver based on destination type ───────────────────────────
        let resp: Response;

        switch (routeRecord.destination_type) {
            case 'http': {
                const url = routeRecord.config.url as string;
                if (!url) return badRequest('Destination URL not configured');
                resp = await safeRemoteFetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(testPayload),
                    signal: AbortSignal.timeout(10000),
                });
                break;
            }
            case 'slack': {
                const url = routeRecord.config.webhook_url as string;
                if (!url) return badRequest('Slack webhook URL not configured');
                const slackBody = {
                    text: '✅ *CrewForm Webhook Test*\n\nThis is a test message to verify your Slack webhook is working correctly.',
                };
                resp = await safeRemoteFetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(slackBody),
                    signal: AbortSignal.timeout(10000),
                });
                break;
            }
            case 'discord': {
                const url = routeRecord.config.webhook_url as string;
                if (!url) return badRequest('Discord webhook URL not configured');
                const discordBody = {
                    embeds: [{
                        title: '✅ CrewForm Webhook Test',
                        description: 'This is a test message to verify your Discord webhook is working correctly.',
                        color: 0x22c55e,
                        fields: [
                            { name: 'Agent', value: 'CrewForm Test', inline: true },
                            { name: 'Status', value: 'test', inline: true },
                        ],
                        timestamp: new Date().toISOString(),
                    }],
                };
                resp = await safeRemoteFetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(discordBody),
                    signal: AbortSignal.timeout(10000),
                });
                break;
            }
            case 'telegram': {
                const botToken = routeRecord.config.bot_token as string;
                const chatId = routeRecord.config.chat_id as string;
                const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
                resp = await fetch(telegramUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: chatId,
                        text: '✅ *CrewForm Webhook Test*\n\nThis is a test message to verify your Telegram webhook is working correctly\\.',
                        parse_mode: 'MarkdownV2',
                    }),
                    signal: AbortSignal.timeout(10000),
                });
                break;
            }
            case 'teams': {
                const url = routeRecord.config.webhook_url as string;
                if (!url) return badRequest('Teams webhook URL not configured');
                const teamsBody = {
                    type: 'message',
                    attachments: [{
                        contentType: 'application/vnd.microsoft.card.adaptive',
                        content: {
                            $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
                            type: 'AdaptiveCard',
                            version: '1.4',
                            body: [{
                                type: 'TextBlock',
                                size: 'Medium',
                                weight: 'Bolder',
                                text: '✅ CrewForm Webhook Test',
                                color: 'Good',
                            }, {
                                type: 'TextBlock',
                                text: 'This is a test message to verify your Teams webhook is working correctly.',
                                wrap: true,
                            }],
                        },
                    }],
                };
                resp = await safeRemoteFetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(teamsBody),
                    signal: AbortSignal.timeout(10000),
                });
                break;
            }
            case 'asana': {
                const pat = routeRecord.config.pat as string;
                const projectGid = routeRecord.config.project_gid as string;
                if (!pat || !projectGid) return badRequest('Asana PAT and Project GID are required');
                const asanaBody = {
                    data: {
                        name: '[CrewForm] Webhook Test',
                        notes: '✅ This is a test task created by CrewForm to verify your Asana integration is working correctly.',
                        projects: [projectGid],
                    },
                };
                resp = await fetch('https://app.asana.com/api/1.0/tasks', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${pat}`,
                    },
                    body: JSON.stringify(asanaBody),
                    signal: AbortSignal.timeout(10000),
                });
                break;
            }
            case 'trello': {
                const apiKey = routeRecord.config.api_key as string;
                const token = routeRecord.config.token as string;
                const listId = routeRecord.config.list_id as string;
                if (!apiKey || !token || !listId) {
                    return badRequest('Trello API Key, Token, and Default List ID are all required');
                }
                const trelloBody = {
                    name: '[CrewForm] Webhook Test',
                    desc: '✅ This is a test card created by CrewForm to verify your Trello integration is working correctly.\n\nYou can safely delete this card.',
                    idList: listId,
                    pos: 'top',
                };
                resp = await fetch(
                    `https://api.trello.com/1/cards?key=${encodeURIComponent(apiKey)}&token=${encodeURIComponent(token)}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(trelloBody),
                        signal: AbortSignal.timeout(10000),
                    },
                );
                break;
            }
            default:
                return badRequest(`Unsupported destination type: ${routeRecord.destination_type}`);
        }

        // Return result with response body for debugging
        let respBody = '';
        try {
            respBody = await resp.text();
        } catch (_e) {
            // ignore
        }

        if (resp.ok) {
            return ok({ ok: true, status_code: resp.status });
        } else {
            return ok({ ok: false, status_code: resp.status, error: respBody.substring(0, 500) });
        }

    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return serverError(message);
    }
});
