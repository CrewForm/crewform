// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

/**
 * Linear Channel — Inbound Webhook Handler
 *
 * Receives Linear webhook events when an issue is created, state-changed,
 * or labelled with a trigger label. Creates a CrewForm task and maps the
 * Linear issue for bidirectional updates (results posted as comments).
 *
 *  How it works:
 *  1. Linear sends POST with webhook payload (action, type, data)
 *  2. Verify webhook signature via Linear-Signature header
 *  3. Filter for relevant events (Issue create / state change / label)
 *  4. Look up matching messaging_channel by team_id
 *  5. Create a task and insert linear_issue_mappings record
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ok, serverError } from '../_shared/response.ts';

// ─── Types ──────────────────────────────────────────────────────────────────

interface LinearWebhookPayload {
    action: 'create' | 'update' | 'remove';
    type: string;
    data: {
        id: string;
        title?: string;
        description?: string;
        state?: {
            id: string;
            name: string;
            type: string;
        };
        team?: {
            id: string;
            key: string;
            name: string;
        };
        labels?: Array<{
            id: string;
            name: string;
        }>;
        identifier?: string;
        url?: string;
        assignee?: {
            id: string;
            name: string;
        };
        priority?: number;
        previousIdentifiers?: string[];
    };
    updatedFrom?: {
        stateId?: string;
        labelIds?: string[];
        updatedAt?: string;
    };
    url?: string;
    createdAt?: string;
    organizationId?: string;
    webhookTimestamp?: number;
}

interface ChannelRow {
    id: string;
    workspace_id: string;
    config: Record<string, unknown>;
    default_agent_id: string | null;
    default_team_id: string | null;
}

// ─── Signature Verification ─────────────────────────────────────────────────

async function verifyLinearSignature(
    body: string,
    signature: string | null,
    secret: string,
): Promise<boolean> {
    if (!signature) return false;

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    );

    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
    const hexSig = Array.from(new Uint8Array(sig))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

    return hexSig === signature;
}

// ─── Main Handler ───────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
    if (req.method !== 'POST') {
        return new Response('OK', { status: 200 });
    }

    try {
        const rawBody = await req.text();
        const payload = JSON.parse(rawBody) as LinearWebhookPayload;

        // Only handle Issue events
        if (payload.type !== 'Issue') {
            return ok({ ok: true, skipped: true, reason: `ignored type: ${payload.type}` });
        }

        const issue = payload.data;
        const teamId = issue.team?.id;

        if (!teamId || !issue.id) {
            return ok({ ok: true, skipped: true, reason: 'no team or issue id' });
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Find matching Linear messaging channels
        const { data: channels } = await supabase
            .from('messaging_channels')
            .select('id, workspace_id, config, default_agent_id, default_team_id')
            .eq('platform', 'linear')
            .eq('is_active', true);

        const channelRows = (channels ?? []) as ChannelRow[];

        // Match by team_id
        const matchingChannels = channelRows.filter((c) => {
            const cfgTeamId = c.config.linear_team_id as string | undefined;
            return cfgTeamId === teamId;
        });

        if (matchingChannels.length === 0) {
            return ok({ ok: true, skipped: true, reason: 'no matching channel' });
        }

        // Process each matching channel
        for (const channel of matchingChannels) {
            // Verify webhook signature if secret is configured
            const webhookSecret = channel.config.webhook_secret as string | undefined;
            if (webhookSecret) {
                const signature = req.headers.get('linear-signature');
                const valid = await verifyLinearSignature(rawBody, signature, webhookSecret);
                if (!valid) {
                    console.warn(`[channel-linear] Invalid signature for channel ${channel.id}`);
                    continue;
                }
            }

            // Check trigger conditions
            const shouldTrigger = evaluateTrigger(payload, channel.config);
            if (!shouldTrigger) continue;

            if (!channel.default_agent_id && !channel.default_team_id) {
                console.warn(`[channel-linear] Channel ${channel.id} has no agent or team configured`);
                continue;
            }

            // Check for duplicate mapping (avoid re-triggering same issue)
            const { data: existingMapping } = await supabase
                .from('linear_issue_mappings')
                .select('id')
                .eq('linear_issue_id', issue.id)
                .eq('workspace_id', channel.workspace_id)
                .limit(1);

            if (existingMapping && existingMapping.length > 0) {
                console.log(`[channel-linear] Issue ${issue.id} already mapped, skipping`);
                continue;
            }

            // Resolve workspace owner
            const { data: ws } = await supabase
                .from('workspaces')
                .select('owner_id')
                .eq('id', channel.workspace_id)
                .single();

            const ownerId = (ws as { owner_id: string } | null)?.owner_id;
            if (!ownerId) {
                console.error(`[channel-linear] Could not resolve workspace owner for ${channel.workspace_id}`);
                continue;
            }

            // Build source_channel for reply-to-source
            const sourceChannel = {
                platform: 'linear',
                linear_issue_id: issue.id,
                linear_api_key: channel.config.api_key as string,
                linear_done_state_name: (channel.config.done_state_name as string) || undefined,
                channel_db_id: channel.id,
            };

            const taskTitle = `Linear: ${issue.identifier ?? ''} ${(issue.title ?? '').substring(0, 80)}`.trim();
            const description = issue.description || issue.title || taskTitle;

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

                if (runErr) {
                    console.error(`[channel-linear] Failed to create team run: ${runErr.message}`);
                    continue;
                }
                taskOrRunId = (run as { id: string }).id;

                await supabase.from('linear_issue_mappings').insert({
                    workspace_id: channel.workspace_id,
                    linear_issue_id: issue.id,
                    linear_team_id: teamId,
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
                        priority: mapLinearPriority(issue.priority),
                        source_channel: sourceChannel,
                        metadata: {
                            source: 'messaging_channel',
                            platform: 'linear',
                            linear_issue_id: issue.id,
                            linear_team_id: teamId,
                            linear_identifier: issue.identifier,
                            channel_id: channel.id,
                        },
                    })
                    .select('id')
                    .single();

                if (taskErr) {
                    console.error(`[channel-linear] Failed to create task: ${taskErr.message}`);
                    continue;
                }
                taskOrRunId = (task as { id: string }).id;

                await supabase.from('linear_issue_mappings').insert({
                    workspace_id: channel.workspace_id,
                    linear_issue_id: issue.id,
                    linear_team_id: teamId,
                    task_id: taskOrRunId,
                });
            }

            // Log to channel_message_log
            await supabase.from('channel_message_log').insert({
                channel_id: channel.id,
                direction: 'inbound',
                task_id: channel.default_team_id ? null : taskOrRunId,
                team_run_id: channel.default_team_id ? taskOrRunId : null,
                message_preview: (issue.title ?? '').substring(0, 200),
                platform_ref: {
                    issue_id: issue.id,
                    team_id: teamId,
                    identifier: issue.identifier,
                    url: issue.url ?? payload.url,
                },
                status: 'delivered',
            });

            console.log(
                `[channel-linear] Created ${channel.default_team_id ? 'team run' : 'task'} ${taskOrRunId} from issue ${issue.identifier ?? issue.id}`,
            );
        }

        return ok({ ok: true });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[channel-linear] Error:', message);
        return serverError(message);
    }
});

// ─── Trigger Evaluation ─────────────────────────────────────────────────────

function evaluateTrigger(
    payload: LinearWebhookPayload,
    config: Record<string, unknown>,
): boolean {
    const triggerOn = (config.trigger_on as string[]) ?? ['create'];
    const issue = payload.data;

    // Trigger on issue creation
    if (payload.action === 'create' && triggerOn.includes('create')) {
        return true;
    }

    // Trigger on state change to a configured trigger state
    if (payload.action === 'update' && triggerOn.includes('state_change')) {
        const triggerStates = (config.trigger_states as string[]) ?? [];
        const currentState = issue.state?.name?.toLowerCase();
        if (currentState && triggerStates.some((s) => s.toLowerCase() === currentState)) {
            // Only trigger if state actually changed (not other field updates)
            if (payload.updatedFrom?.stateId) {
                return true;
            }
        }
    }

    // Trigger on label addition
    if (payload.action === 'update' && triggerOn.includes('label')) {
        const triggerLabels = (config.trigger_labels as string[]) ?? [];
        const issueLabels = (issue.labels ?? []).map((l) => l.name.toLowerCase());
        const previousLabelIds = payload.updatedFrom?.labelIds ?? [];

        // Check if any trigger label was just added
        if (triggerLabels.some((tl) => issueLabels.includes(tl.toLowerCase()))) {
            // Only trigger if labels changed
            if (previousLabelIds.length !== (issue.labels ?? []).length) {
                return true;
            }
        }
    }

    return false;
}

// ─── Priority Mapping ───────────────────────────────────────────────────────

function mapLinearPriority(priority: number | undefined): string {
    switch (priority) {
        case 0:
            return 'low'; // No priority
        case 1:
            return 'urgent';
        case 2:
            return 'high';
        case 3:
            return 'medium';
        case 4:
            return 'low';
        default:
            return 'medium';
    }
}
