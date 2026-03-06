// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

/**
 * Discord Channel — Inbound Interaction Handler
 *
 * Supports two modes:
 * - **Managed bot**: Uses DISCORD_BOT_TOKEN env var. Users link via /connect command.
 * - **BYOB**: Bot token stored per-channel in config.
 *
 * Discord Interactions Endpoint: POST {SUPABASE_URL}/functions/v1/channel-discord
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ok, serverError } from '../_shared/response.ts';

const INTERACTION_PING = 1;
const INTERACTION_APPLICATION_COMMAND = 2;

interface DiscordInteraction {
    type: number;
    id: string;
    token: string;
    guild_id?: string;
    channel_id?: string;
    member?: {
        user?: { id: string; username: string; discriminator: string };
    };
    user?: { id: string; username: string; discriminator: string };
    data?: {
        name: string;
        options?: Array<{ name: string; type: number; value: string }>;
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

function reply(content: string) {
    return new Response(
        JSON.stringify({ type: 4, data: { content } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
}

// ─── Ed25519 Signature Verification ──────────────────────────────────────────

function hexToUint8Array(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes;
}

async function verifyDiscordSignature(req: Request, body: string): Promise<boolean> {
    const publicKeyHex = Deno.env.get('DISCORD_PUBLIC_KEY');
    if (!publicKeyHex) {
        console.error('[channel-discord] DISCORD_PUBLIC_KEY env not set');
        return false;
    }

    const signature = req.headers.get('X-Signature-Ed25519');
    const timestamp = req.headers.get('X-Signature-Timestamp');
    if (!signature || !timestamp) return false;

    try {
        const publicKeyBytes = hexToUint8Array(publicKeyHex);
        const key = await crypto.subtle.importKey(
            'raw',
            publicKeyBytes,
            { name: 'Ed25519', namedCurve: 'Ed25519' },
            false,
            ['verify'],
        );

        const signatureBytes = hexToUint8Array(signature);
        const messageBytes = new TextEncoder().encode(timestamp + body);

        return await crypto.subtle.verify('Ed25519', key, signatureBytes, messageBytes);
    } catch (err) {
        console.error('[channel-discord] Signature verification error:', err);
        return false;
    }
}

// ─── Main Handler ────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
    if (req.method !== 'POST') {
        return new Response('OK', { status: 200 });
    }

    try {
        // Read body as text for signature verification
        const body = await req.text();

        // Verify Discord signature
        const isValid = await verifyDiscordSignature(req, body);
        if (!isValid) {
            return new Response('Invalid signature', { status: 401 });
        }

        const interaction = JSON.parse(body) as DiscordInteraction;

        // Handle Discord's verification ping
        if (interaction.type === INTERACTION_PING) {
            return new Response(JSON.stringify({ type: 1 }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        if (interaction.type !== INTERACTION_APPLICATION_COMMAND || !interaction.data) {
            return ok({ type: 1 });
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const managedBotToken = Deno.env.get('DISCORD_BOT_TOKEN');

        const channelId = interaction.channel_id ?? '';
        const guildId = interaction.guild_id ?? '';
        const userName = interaction.member?.user?.username ?? interaction.user?.username ?? 'Unknown';

        // ── Handle /connect command ─────────────────────────────────────
        if (interaction.data.name === 'connect') {
            const code = interaction.data.options?.find(o => o.name === 'code')?.value;
            if (!code) return reply('❌ Usage: `/connect code:<your_code>`');

            const { data: channel, error: cErr } = await supabase
                .from('messaging_channels')
                .select('id, default_agent_id, default_team_id')
                .eq('connect_code', code)
                .eq('platform', 'discord')
                .single();

            if (cErr || !channel) return reply('❌ Invalid connect code. Check Settings → Channels in CrewForm.');

            await supabase
                .from('messaging_channels')
                .update({ platform_chat_id: channelId, connect_code: null })
                .eq('id', (channel as ChannelRow).id);

            return reply('✅ Connected! Use `/ask prompt:<your question>` to send requests to your agent.');
        }

        // ── Handle /ask command ─────────────────────────────────────────
        if (interaction.data.name !== 'ask') {
            return reply('❌ Unknown command. Use `/ask prompt:<your question>` or `/connect code:<code>`.');
        }

        const prompt = interaction.data.options?.find(o => o.name === 'prompt')?.value;
        if (!prompt) return reply('❌ Please provide a prompt: `/ask prompt:<your question>`');

        // Find matching channel
        const { data: channels } = await supabase
            .from('messaging_channels')
            .select('id, workspace_id, config, default_agent_id, default_team_id, is_managed, platform_chat_id')
            .eq('platform', 'discord')
            .eq('is_active', true);

        const channelRows = (channels ?? []) as ChannelRow[];

        // Try managed mode first
        let channel = channelRows.find(c => c.is_managed && c.platform_chat_id === channelId);

        // Fallback to BYOB
        if (!channel) {
            channel = channelRows.find(c =>
                !c.is_managed && (String(c.config.guild_id) === guildId || String(c.config.channel_id) === channelId),
            );
        }

        if (!channel || (!channel.default_agent_id && !channel.default_team_id)) {
            return reply('❌ No agent configured. Run `/connect code:<code>` first, or set up a channel in CrewForm Settings.');
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
            platform: 'discord',
            channel_id: channelId,
            guild_id: guildId,
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
                    status: 'dispatched',
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
                    title: `Discord: ${prompt.substring(0, 80)}`,
                    description: prompt,
                    workspace_id: channel.workspace_id,
                    assigned_agent_id: channel.default_agent_id,
                    created_by: ownerId,
                    status: 'dispatched',
                    priority: 'medium',
                    source_channel: sourceChannel,
                    metadata: {
                        source: 'messaging_channel',
                        platform: 'discord',
                        sender: userName,
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
            message_preview: prompt.substring(0, 200),
            platform_ref: { interaction_id: interaction.id, channel_id: channelId },
            status: 'delivered',
        });

        return reply(`⏳ Processing your request...\n> ${prompt.substring(0, 200)}`);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[channel-discord] Error:', message);
        return serverError(message);
    }
});
