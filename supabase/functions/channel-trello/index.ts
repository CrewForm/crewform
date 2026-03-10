// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

/**
 * Trello Channel — Inbound Webhook Handler
 *
 * Receives Trello webhook events when a card is created or moved to a
 * configured "trigger" list. Creates a CrewForm task and maps the Trello
 * card for bidirectional updates.
 *
 *  How it works:
 *  1. Trello sends a HEAD request during webhook registration → respond 200
 *  2. Trello sends POST with model + action data on board events
 *  3. We filter for card creation / card moved to trigger list
 *  4. Look up matching messaging_channel by board ID
 *  5. Create a task and insert trello_card_mappings record
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ok, serverError } from '../_shared/response.ts';

interface TrelloAction {
    type: string;
    data: {
        card?: {
            id: string;
            name: string;
            desc?: string;
            idList?: string;
            shortLink?: string;
        };
        list?: {
            id: string;
            name: string;
        };
        listAfter?: {
            id: string;
            name: string;
        };
        listBefore?: {
            id: string;
            name: string;
        };
        board?: {
            id: string;
            name: string;
        };
    };
    memberCreator?: {
        fullName: string;
        username: string;
    };
}

interface TrelloWebhookPayload {
    action: TrelloAction;
    model: {
        id: string;
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
    // Trello sends HEAD during webhook registration — must respond 200
    if (req.method === 'HEAD') {
        return new Response('OK', { status: 200 });
    }

    if (req.method !== 'POST') {
        return new Response('OK', { status: 200 });
    }

    try {
        const payload = (await req.json()) as TrelloWebhookPayload;
        const action = payload.action;

        if (!action || !action.data?.card) {
            return ok({ ok: true, skipped: true, reason: 'no card data' });
        }

        // Only trigger on card creation or card moving to a new list
        const isCardCreated = action.type === 'createCard';
        const isCardMoved = action.type === 'updateCard' && !!action.data.listAfter;

        if (!isCardCreated && !isCardMoved) {
            return ok({ ok: true, skipped: true, reason: `ignored action: ${action.type}` });
        }

        const card = action.data.card;
        const boardId = action.data.board?.id ?? payload.model.id;
        const targetListId = isCardMoved ? action.data.listAfter!.id : (card.idList ?? action.data.list?.id);

        if (!targetListId) {
            return ok({ ok: true, skipped: true, reason: 'no target list' });
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Find a matching Trello messaging channel
        const { data: channels } = await supabase
            .from('messaging_channels')
            .select('id, workspace_id, config, default_agent_id, default_team_id')
            .eq('platform', 'trello')
            .eq('is_active', true);

        const channelRows = (channels ?? []) as ChannelRow[];

        // Match by board_id AND trigger_list_id
        const channel = channelRows.find((c) => {
            const cfgBoard = c.config.board_id as string | undefined;
            const cfgTriggerList = c.config.trigger_list_id as string | undefined;
            return cfgBoard === boardId && cfgTriggerList === targetListId;
        });

        if (!channel) {
            return ok({ ok: true, skipped: true, reason: 'no matching channel' });
        }

        if (!channel.default_agent_id && !channel.default_team_id) {
            return ok({ ok: true, skipped: true, reason: 'no agent or team configured' });
        }

        // Resolve workspace owner
        const { data: ws } = await supabase
            .from('workspaces')
            .select('owner_id')
            .eq('id', channel.workspace_id)
            .single();

        const ownerId = (ws as { owner_id: string } | null)?.owner_id;
        if (!ownerId) return serverError('Could not resolve workspace owner');

        // Build source_channel for reply-to-source
        const sourceChannel = {
            platform: 'trello',
            trello_card_id: card.id,
            trello_api_key: channel.config.api_key as string,
            trello_token: channel.config.token as string,
            trello_review_list_id: (channel.config.review_list_id as string) || undefined,
            channel_db_id: channel.id,
        };

        const taskTitle = `Trello: ${card.name.substring(0, 80)}`;
        const description = card.desc || card.name;

        let taskOrRunId: string;

        if (channel.default_team_id) {
            const { data: run, error: runErr } = await supabase
                .from('team_runs')
                .insert({
                    team_id: channel.default_team_id,
                    workspace_id: channel.workspace_id,
                    input_task: description,
                    created_by: ownerId,
                    status: 'dispatched',
                    source_channel: sourceChannel,
                })
                .select('id')
                .single();

            if (runErr) return serverError(`Failed to create team run: ${runErr.message}`);
            taskOrRunId = (run as { id: string }).id;

            // Create card mapping
            await supabase.from('trello_card_mappings').insert({
                workspace_id: channel.workspace_id,
                trello_card_id: card.id,
                trello_board_id: boardId,
                trello_list_id: targetListId,
                team_run_id: taskOrRunId,
            });
        } else {
            const { data: task, error: taskErr } = await supabase
                .from('tasks')
                .insert({
                    title: taskTitle,
                    description,
                    workspace_id: channel.workspace_id,
                    assigned_agent_id: channel.default_agent_id,
                    created_by: ownerId,
                    status: 'dispatched',
                    priority: 'medium',
                    source_channel: sourceChannel,
                    metadata: {
                        source: 'messaging_channel',
                        platform: 'trello',
                        trello_card_id: card.id,
                        trello_board_id: boardId,
                        channel_id: channel.id,
                    },
                })
                .select('id')
                .single();

            if (taskErr) return serverError(`Failed to create task: ${taskErr.message}`);
            taskOrRunId = (task as { id: string }).id;

            // Create card mapping
            await supabase.from('trello_card_mappings').insert({
                workspace_id: channel.workspace_id,
                trello_card_id: card.id,
                trello_board_id: boardId,
                trello_list_id: targetListId,
                task_id: taskOrRunId,
            });
        }

        // Log to channel_message_log
        await supabase.from('channel_message_log').insert({
            channel_id: channel.id,
            direction: 'inbound',
            task_id: channel.default_team_id ? null : taskOrRunId,
            team_run_id: channel.default_team_id ? taskOrRunId : null,
            message_preview: card.name.substring(0, 200),
            platform_ref: { card_id: card.id, board_id: boardId, list_id: targetListId },
            status: 'delivered',
        });

        console.log(`[channel-trello] Created ${channel.default_team_id ? 'team run' : 'task'} ${taskOrRunId} from card ${card.id}`);

        return ok({ ok: true, task_id: taskOrRunId });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[channel-trello] Error:', message);
        return serverError(message);
    }
});
