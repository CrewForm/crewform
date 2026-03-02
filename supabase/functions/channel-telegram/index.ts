// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

/**
 * Telegram Channel — Inbound Message Handler
 *
 * Supports two modes:
 * - **Managed bot**: Uses TELEGRAM_BOT_TOKEN env var. Users link via /connect <code>.
 * - **BYOB (Bring Your Own Bot)**: Bot token stored per-channel in config.
 *
 * Telegram webhook URL: POST {SUPABASE_URL}/functions/v1/channel-telegram
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ok, badRequest, serverError } from '../_shared/response.ts';

interface TelegramUpdate {
    update_id: number;
    message?: {
        message_id: number;
        from?: { id: number; first_name: string; last_name?: string; username?: string };
        chat: { id: number; type: string; title?: string };
        date: number;
        text?: string;
    };
}

interface ChannelRow {
    id: string;
    workspace_id: string;
    platform: string;
    config: Record<string, unknown>;
    default_agent_id: string | null;
    default_team_id: string | null;
    is_active: boolean;
    is_managed: boolean;
    connect_code: string | null;
    platform_chat_id: string | null;
}

Deno.serve(async (req: Request) => {
    if (req.method !== 'POST') {
        return new Response('OK', { status: 200 });
    }

    try {
        const update = (await req.json()) as TelegramUpdate;

        if (!update.message?.text) {
            return ok({ ok: true, skipped: true });
        }

        const msg = update.message;
        const chatId = String(msg.chat.id);
        const messageText = msg.text;
        const senderName = msg.from
            ? `${msg.from.first_name}${msg.from.last_name ? ` ${msg.from.last_name}` : ''}`
            : 'Unknown';

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Managed bot token from env, fallback to per-channel BYOB
        const managedBotToken = Deno.env.get('TELEGRAM_BOT_TOKEN');

        // ── Handle /connect command ─────────────────────────────────────
        if (messageText.startsWith('/connect ')) {
            const code = messageText.substring(9).trim();
            if (!code) {
                await sendTelegramMessage(managedBotToken, chatId, '❌ Usage: /connect <code>');
                return ok({ ok: true });
            }

            const { data: channel, error: cErr } = await supabase
                .from('messaging_channels')
                .select('id, workspace_id, default_agent_id, default_team_id')
                .eq('connect_code', code)
                .eq('platform', 'telegram')
                .single();

            if (cErr || !channel) {
                await sendTelegramMessage(managedBotToken, chatId, '❌ Invalid connect code. Check Settings → Channels in CrewForm.');
                return ok({ ok: true });
            }

            // Link the chat
            await supabase
                .from('messaging_channels')
                .update({ platform_chat_id: chatId, connect_code: null })
                .eq('id', (channel as ChannelRow).id);

            const agentLabel = (channel as ChannelRow).default_agent_id ? 'your configured agent' : 'your configured team';
            await sendTelegramMessage(
                managedBotToken,
                chatId,
                `✅ Connected! Messages in this chat will be routed to ${agentLabel}.\n\nSend any message to get started.`,
            );
            return ok({ ok: true, connected: true });
        }

        // Ignore other bot commands
        if (messageText.startsWith('/') && !messageText.startsWith('/ask')) {
            return ok({ ok: true, skipped: true });
        }

        // Strip /ask prefix if present
        const prompt = messageText.startsWith('/ask ')
            ? messageText.substring(5).trim()
            : messageText;

        if (!prompt) {
            return ok({ ok: true, skipped: true, reason: 'empty prompt' });
        }

        // ── Find matching channel ───────────────────────────────────────

        const { data: channels } = await supabase
            .from('messaging_channels')
            .select('id, workspace_id, config, default_agent_id, default_team_id, is_active, is_managed, platform_chat_id')
            .eq('platform', 'telegram')
            .eq('is_active', true);

        const channelRows = (channels ?? []) as ChannelRow[];

        // Try managed mode first (match by platform_chat_id)
        let channel = channelRows.find(c => c.is_managed && c.platform_chat_id === chatId);

        // Fallback to BYOB mode (match by chat_id in config)
        if (!channel) {
            channel = channelRows.find(c => !c.is_managed && String(c.config.chat_id) === chatId);
        }

        if (!channel) {
            // If managed bot is configured, tell user to connect
            if (managedBotToken) {
                await sendTelegramMessage(
                    managedBotToken,
                    chatId,
                    '👋 Hi! To get started, run `/connect <code>` with the code from your CrewForm Settings → Channels.',
                );
            }
            return ok({ ok: true, skipped: true, reason: 'no matching channel' });
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

        // Bot token: managed env var or BYOB config
        const botToken = channel.is_managed
            ? (managedBotToken ?? '')
            : (channel.config.bot_token as string ?? '');

        const sourceChannel = {
            platform: 'telegram',
            chat_id: chatId,
            message_id: String(msg.message_id),
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
                    input_task: prompt,
                    created_by: ownerId,
                    status: 'pending',
                    source_channel: sourceChannel,
                })
                .select('id')
                .single();

            if (runErr) return serverError(`Failed to create team run: ${runErr.message}`);
            taskOrRunId = (run as { id: string }).id;
        } else {
            const { data: task, error: taskErr } = await supabase
                .from('tasks')
                .insert({
                    title: `Telegram: ${prompt.substring(0, 80)}`,
                    description: prompt,
                    workspace_id: channel.workspace_id,
                    assigned_agent_id: channel.default_agent_id,
                    created_by: ownerId,
                    status: 'pending',
                    priority: 'medium',
                    source_channel: sourceChannel,
                    metadata: {
                        source: 'messaging_channel',
                        platform: 'telegram',
                        sender: senderName,
                        channel_id: channel.id,
                    },
                })
                .select('id')
                .single();

            if (taskErr) return serverError(`Failed to create task: ${taskErr.message}`);
            taskOrRunId = (task as { id: string }).id;
        }

        // Log inbound message
        await supabase.from('channel_message_log').insert({
            channel_id: channel.id,
            direction: 'inbound',
            task_id: channel.default_team_id ? null : taskOrRunId,
            team_run_id: channel.default_team_id ? taskOrRunId : null,
            message_preview: prompt.substring(0, 200),
            platform_ref: { message_id: msg.message_id, chat_id: chatId },
            status: 'delivered',
        });

        // Send "processing" indicator
        await fetch(`https://api.telegram.org/bot${botToken}/sendChatAction`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, action: 'typing' }),
        });

        return ok({ ok: true, task_id: taskOrRunId });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[channel-telegram] Error:', message);
        return serverError(message);
    }
});

// Helper to send a Telegram message
async function sendTelegramMessage(botToken: string | undefined, chatId: string, text: string) {
    if (!botToken) return;
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
    });
}
