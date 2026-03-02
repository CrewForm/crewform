// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

/**
 * Email Channel — Inbound Email Handler (Resend)
 *
 * Resend's email.received webhook sends metadata only (no body).
 * This function fetches the email content via the Resend API.
 *
 * Setup:
 * 1. Add MX record: inbound-smtp.us-east-1.resend.com (priority 10) for your inbound subdomain
 * 2. Add webhook in Resend dashboard → event: email.received → URL: this function
 * 3. Set RESEND_API_KEY as Supabase Edge Function secret
 *
 * POST {SUPABASE_URL}/functions/v1/channel-email
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ok, badRequest, serverError } from '../_shared/response.ts';

/**
 * Resend email.received webhook payload
 * Note: Body content is NOT included — must be fetched via API
 */
interface ResendWebhookPayload {
    type: string;
    data: {
        email_id: string;
        from: string;
        to: string[];
        subject: string;
        created_at: string;
    };
}

interface ChannelRow {
    id: string;
    workspace_id: string;
    config: Record<string, unknown>;
    default_agent_id: string | null;
    default_team_id: string | null;
}

Deno.serve(async (req: Request) => {
    if (req.method !== 'POST') {
        return ok({ ok: true });
    }

    try {
        const payload = (await req.json()) as ResendWebhookPayload;

        // Validate this is an email.received event
        if (payload.type !== 'email.received' || !payload.data?.email_id) {
            return ok({ ok: true, skipped: true, reason: 'not an email.received event' });
        }

        const { email_id, from, to, subject } = payload.data;

        if (!from || !to || to.length === 0) {
            return badRequest('Missing required from/to fields');
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const resendApiKey = Deno.env.get('RESEND_API_KEY');
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // ── Fetch email content via Resend API ──────────────────────────
        let body = '';
        if (resendApiKey) {
            try {
                const resp = await fetch(`https://api.resend.com/emails/${email_id}/content`, {
                    headers: { Authorization: `Bearer ${resendApiKey}` },
                    signal: AbortSignal.timeout(10000),
                });

                if (resp.ok) {
                    const content = (await resp.json()) as { text?: string; html?: string };
                    // Prefer plain text, fallback to stripped HTML
                    body = content.text ?? content.html?.replace(/<[^>]*>/g, '') ?? '';
                } else {
                    console.warn(`[channel-email] Failed to fetch email content: ${resp.status}`);
                }
            } catch (fetchErr) {
                console.warn('[channel-email] Error fetching email content:', fetchErr);
            }
        }

        const prompt = `${subject}\n\n${body}`.trim();
        if (!prompt) {
            return ok({ ok: true, skipped: true, reason: 'empty email' });
        }

        // ── Match to-address against configured channels ────────────────
        const toAddresses = to.map(a => a.toLowerCase());

        const { data: channels } = await supabase
            .from('messaging_channels')
            .select('id, workspace_id, config, default_agent_id, default_team_id')
            .eq('platform', 'email')
            .eq('is_active', true);

        const channelRows = (channels ?? []) as ChannelRow[];
        const channel = channelRows.find(c => {
            const inboundAddr = (c.config.inbound_address as string ?? '').toLowerCase();
            return inboundAddr && toAddresses.some(a => a.includes(inboundAddr));
        });

        if (!channel) {
            return ok({ ok: true, skipped: true, reason: 'no matching email channel' });
        }

        if (!channel.default_agent_id && !channel.default_team_id) {
            return badRequest('Channel has no default agent or team configured');
        }

        // Resolve workspace owner
        const { data: ws } = await supabase
            .from('workspaces')
            .select('owner_id')
            .eq('id', channel.workspace_id)
            .single();

        const ownerId = (ws as { owner_id: string } | null)?.owner_id;
        if (!ownerId) return serverError('Could not resolve workspace owner');

        const sourceChannel = {
            platform: 'email',
            from_email: from,
            subject: subject,
            channel_db_id: channel.id,
        };

        let taskOrRunId: string;

        if (channel.default_team_id) {
            const { data: run, error: runErr } = await supabase
                .from('team_runs')
                .insert({
                    team_id: channel.default_team_id,
                    workspace_id: channel.workspace_id,
                    input_task: prompt,
                    created_by: ownerId,
                    status: 'pending',
                    source_channel: sourceChannel,
                })
                .select('id')
                .single();

            if (runErr) return serverError(`Failed: ${runErr.message}`);
            taskOrRunId = (run as { id: string }).id;
        } else {
            const { data: task, error: taskErr } = await supabase
                .from('tasks')
                .insert({
                    title: subject || `Email from ${from}`,
                    description: body,
                    workspace_id: channel.workspace_id,
                    assigned_agent_id: channel.default_agent_id,
                    created_by: ownerId,
                    status: 'pending',
                    priority: 'medium',
                    source_channel: sourceChannel,
                    metadata: {
                        source: 'messaging_channel',
                        platform: 'email',
                        sender: from,
                        channel_id: channel.id,
                        email_id: email_id,
                    },
                })
                .select('id')
                .single();

            if (taskErr) return serverError(`Failed: ${taskErr.message}`);
            taskOrRunId = (task as { id: string }).id;
        }

        // Log inbound
        await supabase.from('channel_message_log').insert({
            channel_id: channel.id,
            direction: 'inbound',
            task_id: channel.default_team_id ? null : taskOrRunId,
            team_run_id: channel.default_team_id ? taskOrRunId : null,
            message_preview: prompt.substring(0, 200),
            platform_ref: { from, subject, email_id },
            status: 'delivered',
        });

        return ok({ ok: true, task_id: taskOrRunId });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[channel-email] Error:', message);
        return serverError(message);
    }
});
