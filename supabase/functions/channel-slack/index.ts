// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

/**
 * Slack Channel — Inbound Events Handler
 *
 * Supports two modes:
 * - **Managed bot**: Uses SLACK_BOT_TOKEN env var. Users link via "connect <code>" message.
 * - **BYOB**: Bot token stored per-channel in config.
 *
 * Slack Events API Request URL: POST {SUPABASE_URL}/functions/v1/channel-slack
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ok, serverError } from '../_shared/response.ts';

interface SlackEventPayload {
    type: string;
    token?: string;
    challenge?: string;
    team_id?: string;
    event?: {
        type: string;
        channel: string;
        user: string;
        text: string;
        ts: string;
        thread_ts?: string;
        bot_id?: string;
    };
}

interface ChannelRow {
    id: string;
    workspace_id: string;
    config: Record<string, unknown>;
    default_agent_id: string | null;
    default_team_id: string | null;
    is_managed: boolean;
    platform_chat_id: string | null;
}

Deno.serve(async (req: Request) => {
    if (req.method !== 'POST') {
        return new Response('OK', { status: 200 });
    }

    try {
        const payload = (await req.json()) as SlackEventPayload;

        // Handle Slack's URL verification challenge
        if (payload.type === 'url_verification') {
            return new Response(
                JSON.stringify({ challenge: payload.challenge }),
                { status: 200, headers: { 'Content-Type': 'application/json' } },
            );
        }

        if (payload.type !== 'event_callback' || !payload.event) {
            return ok({ ok: true });
        }

        const event = payload.event;

        // Ignore bot messages
        if (event.bot_id || event.type !== 'message') {
            return ok({ ok: true, skipped: true });
        }

        const text = event.text?.trim();
        if (!text) {
            return ok({ ok: true, skipped: true });
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const managedBotToken = Deno.env.get('SLACK_BOT_TOKEN');

        // ── Handle connect command ──────────────────────────────────────
        const connectMatch = text.match(/^connect\s+(\S+)$/i);
        if (connectMatch) {
            const code = connectMatch[1];
            const { data: channel, error: cErr } = await supabase
                .from('messaging_channels')
                .select('id')
                .eq('connect_code', code)
                .eq('platform', 'slack')
                .single();

            if (cErr || !channel) {
                await sendSlackMessage(managedBotToken, event.channel, '❌ Invalid connect code. Check Settings → Channels in CrewForm.');
                return ok({ ok: true });
            }

            await supabase
                .from('messaging_channels')
                .update({ platform_chat_id: event.channel, connect_code: null })
                .eq('id', (channel as ChannelRow).id);

            await sendSlackMessage(managedBotToken, event.channel, '✅ Connected! Messages in this channel will now be routed to your configured agent.');
            return ok({ ok: true, connected: true });
        }

        // ── Find matching channel ───────────────────────────────────────
        const { data: channels } = await supabase
            .from('messaging_channels')
            .select('id, workspace_id, config, default_agent_id, default_team_id, is_managed, platform_chat_id')
            .eq('platform', 'slack')
            .eq('is_active', true);

        const channelRows = (channels ?? []) as ChannelRow[];

        // Managed mode first
        let channel = channelRows.find(c => c.is_managed && c.platform_chat_id === event.channel);

        // BYOB fallback
        if (!channel) {
            channel = channelRows.find(c => !c.is_managed && String(c.config.channel_id) === event.channel);
        }

        if (!channel || (!channel.default_agent_id && !channel.default_team_id)) {
            if (managedBotToken) {
                await sendSlackMessage(
                    managedBotToken,
                    event.channel,
                    '👋 To get started, type `connect <code>` with the code from your CrewForm Settings → Channels.',
                );
            }
            return ok({ ok: true, skipped: true });
        }

        // Resolve workspace owner
        const { data: ws } = await supabase
            .from('workspaces')
            .select('owner_id')
            .eq('id', channel.workspace_id)
            .single();

        const ownerId = (ws as { owner_id: string } | null)?.owner_id;
        if (!ownerId) return serverError('Could not resolve workspace owner');

        const botToken = channel.is_managed
            ? (managedBotToken ?? '')
            : (channel.config.bot_token as string ?? '');

        const sourceChannel = {
            platform: 'slack',
            channel_id: event.channel,
            thread_ts: event.thread_ts ?? event.ts,
            bot_token: botToken,
            channel_db_id: channel.id,
        };

        let taskOrRunId: string;

        if (channel.default_team_id) {
            const { data: run, error: runErr } = await supabase
                .from('team_runs')
                .insert({
                    team_id: channel.default_team_id,
                    workspace_id: channel.workspace_id,
                    input_task: text,
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
                    title: `Slack: ${text.substring(0, 80)}`,
                    description: text,
                    workspace_id: channel.workspace_id,
                    assigned_agent_id: channel.default_agent_id,
                    created_by: ownerId,
                    status: 'pending',
                    priority: 'medium',
                    source_channel: sourceChannel,
                    metadata: {
                        source: 'messaging_channel',
                        platform: 'slack',
                        sender: event.user,
                        channel_id: channel.id,
                    },
                })
                .select('id')
                .single();

            if (taskErr) return serverError(`Failed: ${taskErr.message}`);
            taskOrRunId = (task as { id: string }).id;
        }

        await supabase.from('channel_message_log').insert({
            channel_id: channel.id,
            direction: 'inbound',
            task_id: channel.default_team_id ? null : taskOrRunId,
            team_run_id: channel.default_team_id ? taskOrRunId : null,
            message_preview: text.substring(0, 200),
            platform_ref: { ts: event.ts, channel: event.channel },
            status: 'delivered',
        });

        // Processing reaction
        await fetch('https://slack.com/api/reactions.add', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${botToken}`,
            },
            body: JSON.stringify({
                channel: event.channel,
                name: 'hourglass_flowing_sand',
                timestamp: event.ts,
            }),
        });

        return ok({ ok: true, task_id: taskOrRunId });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[channel-slack] Error:', message);
        return serverError(message);
    }
});

async function sendSlackMessage(botToken: string | undefined, channel: string, text: string) {
    if (!botToken) return;
    await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${botToken}`,
        },
        body: JSON.stringify({ channel, text }),
    });
}
