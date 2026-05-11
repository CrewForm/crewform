// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { supabase } from './supabase';
import { Resend } from 'resend';
import nodemailer from 'nodemailer';

// ─── Types ───────────────────────────────────────────────────────────────────

interface OutputRoute {
    id: string;
    workspace_id: string;
    name: string;
    destination_type: 'http' | 'slack' | 'discord' | 'telegram' | 'teams' | 'asana' | 'trello' | 'notion' | 'github' | 'email' | 'smtp' | 'linear' | 'google_sheets' | 'google_gmail' | 'google_docs' | 'google_calendar';
    config: Record<string, unknown>;
    events: string[];
    is_active: boolean;
}

interface WebhookPayload {
    id: string;
    event: string;
    task_id: string | null;
    team_run_id: string | null;
    task_title: string;
    agent_name: string;
    status: string;
    result_preview: string | null;
    result_full: string | null;
    error: string | null;
    timestamp: string;
    attachments: WebhookAttachment[];
}

interface WebhookAttachment {
    name: string;
    type: string;
    size: number;
    url: string;
    direction: 'input' | 'output';
}

interface TeamRunInfo {
    id: string;
    team_id: string;
    workspace_id: string;
    status: string;
    input_task: string;
    output?: string | null;
    error_message?: string | null;
}

interface TaskInfo {
    id: string;
    title: string;
    workspace_id: string;
    status: string;
    result?: string | null;
    error?: string | null;
}

interface AgentInfo {
    name: string;
}

// ─── Attachment loader for webhook payloads ──────────────────────────────────

const ATTACHMENT_BUCKET = 'attachments';

interface AttachmentRecord {
    file_name: string;
    file_type: string;
    file_size: number;
    storage_path: string;
    direction: string;
}

/**
 * Load file attachments for a task or team run and generate signed download URLs.
 * Returns an empty array if no attachments exist (never throws).
 */
async function loadAttachmentsForPayload(
    taskId: string | null,
    teamRunId: string | null,
): Promise<WebhookAttachment[]> {
    try {
        let query = supabase
            .from('file_attachments')
            .select('file_name, file_type, file_size, storage_path, direction');

        if (taskId) {
            query = query.eq('task_id', taskId);
        } else if (teamRunId) {
            query = query.eq('team_run_id', teamRunId);
        } else {
            return [];
        }

        const { data: records, error } = await query;
        if (error || !records || records.length === 0) return [];

        const results: WebhookAttachment[] = [];
        for (const record of records as AttachmentRecord[]) {
            const { data: urlData, error: urlError } = await supabase.storage
                .from(ATTACHMENT_BUCKET)
                .createSignedUrl(record.storage_path, 86400); // 24 hours

            if (urlError || !urlData) continue;

            results.push({
                name: record.file_name,
                type: record.file_type,
                size: record.file_size,
                url: urlData.signedUrl,
                direction: record.direction as 'input' | 'output',
            });
        }
        return results;
    } catch {
        console.error('[Webhooks] Failed to load attachments for payload');
        return [];
    }
}

// ─── Main dispatcher ────────────────────────────────────────────────────────

/**
 * Fire webhooks for a task event. Never throws — failures are logged but
 * never block the task completion flow.
 */
export async function dispatchWebhooks(
    task: TaskInfo,
    agent: AgentInfo & { id?: string },
    event: string,
    outputRouteIds: string[] | null = null,
): Promise<void> {
    try {
        // 1. Fetch active routes for this workspace + event
        let query = supabase
            .from('output_routes')
            .select('*')
            .eq('workspace_id', task.workspace_id)
            .eq('is_active', true)
            .contains('events', [event]);

        // If specific routes are requested, filter to those IDs
        if (outputRouteIds !== null) {
            if (outputRouteIds.length === 0) return; // empty array = no dispatch
            query = query.in('id', outputRouteIds);
        }

        const { data: routes, error } = await query;

        if (error || !routes || routes.length === 0) return;

        // 2. Build payload
        const attachments = await loadAttachmentsForPayload(task.id, null);
        const payload: WebhookPayload = {
            id: task.id,
            event,
            task_id: task.id,
            team_run_id: null,
            task_title: task.title,
            agent_name: agent.name,
            status: task.status,
            result_preview: task.result ? task.result.substring(0, 500) : null,
            result_full: task.result ?? null,
            error: task.error ?? null,
            timestamp: new Date().toISOString(),
            attachments,
        };

        // 3. Dispatch to each route (fire-and-forget, parallel)
        const promises = (routes as OutputRoute[]).map((route) =>
            deliverWithRetry(route, task.id, event, payload),
        );
        await Promise.allSettled(promises);

        // 4. Also dispatch to Zapier subscriptions (scoped to this agent)
        void dispatchZapierHooks(task.workspace_id, event, payload, agent.id ?? null, null);
    } catch (err: unknown) {
        // Never let webhook errors bubble up
        console.error('[Webhooks] Dispatch error:', err instanceof Error ? err.message : String(err));
    }
}

/**
 * Fire webhooks for a team run event (team_run.completed, team_run.failed).
 * Never throws — failures are logged but never block the run flow.
 */
export async function dispatchTeamRunWebhooks(
    teamRun: TeamRunInfo,
    teamName: string,
    event: string,
    outputRouteIds: string[] | null = null,
): Promise<void> {
    try {
        let query = supabase
            .from('output_routes')
            .select('*')
            .eq('workspace_id', teamRun.workspace_id)
            .eq('is_active', true)
            .contains('events', [event]);

        // If specific routes are requested, filter to those IDs
        if (outputRouteIds !== null) {
            if (outputRouteIds.length === 0) return; // empty array = no dispatch
            query = query.in('id', outputRouteIds);
        }

        const { data: routes, error } = await query;

        if (error || !routes || routes.length === 0) return;

        const attachments = await loadAttachmentsForPayload(null, teamRun.id);

        // ── Ensure we have the output ──────────────────────────────────────
        // Some executors may not pass the output inline. As a safety net,
        // always fetch from DB if the passed value is missing.
        let resolvedOutput = teamRun.output ?? null;
        if (!resolvedOutput && teamRun.status === 'completed') {
            const { data: runRow } = await supabase
                .from('team_runs')
                .select('output')
                .eq('id', teamRun.id)
                .single();
            resolvedOutput = (runRow as { output: string | null } | null)?.output ?? null;
            if (resolvedOutput) {
                console.log(`[Webhooks] Fetched output from DB for run ${teamRun.id} (${resolvedOutput.length} chars)`);
            } else {
                console.warn(`[Webhooks] No output found in DB for completed run ${teamRun.id}`);
            }
        }

        console.log(`[Webhooks] Team run ${teamRun.id} payload: status=${teamRun.status}, output=${resolvedOutput ? resolvedOutput.length + ' chars' : 'null'}`);

        const payload: WebhookPayload = {
            id: teamRun.id,
            event,
            task_id: null,
            team_run_id: teamRun.id,
            task_title: teamRun.input_task,
            agent_name: teamName,
            status: teamRun.status,
            result_preview: resolvedOutput ? resolvedOutput.substring(0, 500) : null,
            result_full: resolvedOutput,
            error: teamRun.error_message ?? null,
            timestamp: new Date().toISOString(),
            attachments,
        };

        const promises = (routes as OutputRoute[]).map((route) =>
            deliverWithRetry(route, teamRun.id, event, payload),
        );
        await Promise.allSettled(promises);

        // Also dispatch to Zapier subscriptions (scoped to this team)
        void dispatchZapierHooks(teamRun.workspace_id, event, payload, null, teamRun.team_id);
    } catch (err: unknown) {
        console.error('[Webhooks] Team run dispatch error:', err instanceof Error ? err.message : String(err));
    }
}

/**
 * Dispatch to any Zapier REST Hook subscriptions for this workspace + event.
 * Never throws — failures are logged but never block the calling flow.
 */
async function dispatchZapierHooks(
    workspaceId: string,
    event: string,
    payload: WebhookPayload,
    agentId: string | null = null,
    teamId: string | null = null,
): Promise<void> {
    try {
        // Fetch all subscriptions for this workspace + event, then filter in-app
        // to match: (sub.agent_id === agentId OR sub.agent_id IS NULL)
        //       AND (sub.team_id  === teamId  OR sub.team_id  IS NULL)
        const { data: subs, error } = await supabase
            .from('zapier_subscriptions')
            .select('id, target_url, agent_id, team_id')
            .eq('workspace_id', workspaceId)
            .eq('event', event);

        if (error || !subs || subs.length === 0) return;

        // Filter: only fire subscriptions where the filter matches or is null (workspace-wide)
        const matchingSubs = (subs as Array<{ id: string; target_url: string; agent_id: string | null; team_id: string | null }>)
            .filter((sub) => {
                const agentMatch = sub.agent_id === null || sub.agent_id === agentId;
                const teamMatch = sub.team_id === null || sub.team_id === teamId;
                return agentMatch && teamMatch;
            });

        if (matchingSubs.length === 0) return;

        const deliveries = matchingSubs.map(async (sub) => {
            try {
                const resp = await fetch(sub.target_url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                    signal: AbortSignal.timeout(10000),
                });

                if (!resp.ok) {
                    console.warn(`[Zapier] Hook ${sub.id} returned ${resp.status}`);
                    // If Zapier returns 410 Gone, the subscription was cancelled — clean it up
                    if (resp.status === 410) {
                        await supabase.from('zapier_subscriptions').delete().eq('id', sub.id);
                        console.log(`[Zapier] Removed stale subscription ${sub.id}`);
                    }
                }
            } catch (err: unknown) {
                console.error(`[Zapier] Hook ${sub.id} failed:`, err instanceof Error ? err.message : String(err));
            }
        });

        await Promise.allSettled(deliveries);
    } catch (err: unknown) {
        console.error('[Zapier] Dispatch error:', err instanceof Error ? err.message : String(err));
    }
}

// ─── Delivery with 1 retry ──────────────────────────────────────────────────

async function deliverWithRetry(
    route: OutputRoute,
    taskId: string,
    event: string,
    payload: WebhookPayload,
): Promise<void> {
    let lastError: string | null = null;
    let statusCode: number | null = null;

    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            if (attempt > 0) {
                await sleep(5000);
            }

            const result = await deliver(route, payload);
            statusCode = result.statusCode;

            if (result.ok) {
                await logDelivery(route.id, taskId, event, 'success', statusCode, null, payload);
                return;
            }

            lastError = `HTTP ${result.statusCode}`;
        } catch (err: unknown) {
            lastError = err instanceof Error ? err.message : String(err);
        }
    }

    // Both attempts failed
    await logDelivery(route.id, taskId, event, 'failed', statusCode, lastError, payload);
    console.error(`[Webhooks] Failed to deliver to "${route.name}" (${route.destination_type}): ${lastError}`);
}

// ─── Destination handlers ───────────────────────────────────────────────────

async function deliver(
    route: OutputRoute,
    payload: WebhookPayload,
): Promise<{ ok: boolean; statusCode: number }> {
    switch (route.destination_type) {
        case 'http':
            return deliverHTTP(route, payload);
        case 'slack':
            return deliverSlack(route, payload);
        case 'discord':
            return deliverDiscord(route, payload);
        case 'telegram':
            return deliverTelegram(route, payload);
        case 'teams':
            return deliverTeams(route, payload);
        case 'asana':
            return deliverAsana(route, payload);
        case 'trello':
            return deliverTrello(route, payload);
        case 'notion':
            return deliverNotion(route, payload);
        case 'github':
            return deliverGitHubIssue(route, payload);
        case 'email':
            return deliverEmail(route, payload);
        case 'smtp':
            return deliverSmtp(route, payload);
        case 'linear':
            return deliverLinear(route, payload);
        case 'google_sheets':
            return deliverGoogleSheets(route, payload);
        case 'google_gmail':
            return deliverGoogleGmail(route, payload);
        case 'google_docs':
            return deliverGoogleDocs(route, payload);
        case 'google_calendar':
            return deliverGoogleCalendar(route, payload);
        default:
            throw new Error(`Unknown destination type: ${route.destination_type}`);
    }
}

// ── HTTP ─────────────────────────────────────────────────────────────────────

async function deliverHTTP(
    route: OutputRoute,
    payload: WebhookPayload,
): Promise<{ ok: boolean; statusCode: number }> {
    const url = route.config.url as string;
    const secret = route.config.secret as string | undefined;

    const body = JSON.stringify(payload);
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'CrewForm-Webhook/1.0',
    };

    if (secret) {
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
            'raw',
            encoder.encode(secret),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign'],
        );
        const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
        const hex = Array.from(new Uint8Array(sig))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
        headers['X-CrewForm-Signature'] = `sha256=${hex}`;
    }

    const resp = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(10000),
    });

    return { ok: resp.ok, statusCode: resp.status };
}

// ── Slack ────────────────────────────────────────────────────────────────────

async function deliverSlack(
    route: OutputRoute,
    payload: WebhookPayload,
): Promise<{ ok: boolean; statusCode: number }> {
    const url = route.config.webhook_url as string;
    const emoji = payload.status === 'completed' ? '✅' : '❌';
    const color = payload.status === 'completed' ? '#22c55e' : '#ef4444';

    const slackBody = {
        attachments: [
            {
                color,
                blocks: [
                    {
                        type: 'section',
                        text: {
                            type: 'mrkdwn',
                            text: `${emoji} *${payload.team_run_id ? 'Team Run' : 'Task'} ${payload.status}*: ${payload.task_title}\n*${payload.team_run_id ? 'Team' : 'Agent'}:* ${payload.agent_name}`,
                        },
                    },
                    ...(payload.result_full
                        ? [
                            {
                                type: 'section',
                                text: {
                                    type: 'mrkdwn',
                                    text: payload.result_full.length > 2900
                                        ? `\`\`\`${payload.result_full.substring(0, 2900)}\`\`\`\n_Output truncated (${payload.result_full.length} chars). Full output available via HTTP webhook._`
                                        : `\`\`\`${payload.result_full}\`\`\``,
                                },
                            },
                        ]
                        : []),
                    ...(payload.error
                        ? [
                            {
                                type: 'section',
                                text: {
                                    type: 'mrkdwn',
                                    text: `*Error:* ${payload.error}`,
                                },
                            },
                        ]
                        : []),
                ],
            },
        ],
    };

    const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(slackBody),
        signal: AbortSignal.timeout(10000),
    });

    return { ok: resp.ok, statusCode: resp.status };
}

// ── Discord ─────────────────────────────────────────────────────────────────

async function deliverDiscord(
    route: OutputRoute,
    payload: WebhookPayload,
): Promise<{ ok: boolean; statusCode: number }> {
    const url = route.config.webhook_url as string;
    const color = payload.status === 'completed' ? 0x22c55e : 0xef4444;
    const emoji = payload.status === 'completed' ? '✅' : '❌';

    const discordBody = {
        embeds: [
            {
                title: `${emoji} ${payload.team_run_id ? 'Team Run' : 'Task'} ${payload.status}`,
                description: payload.task_title,
                color,
                fields: [
                    { name: payload.team_run_id ? 'Team' : 'Agent', value: payload.agent_name, inline: true },
                    { name: 'Status', value: payload.status, inline: true },
                    ...(payload.result_full
                        ? [{
                            name: 'Result',
                            value: payload.result_full.length > 1000
                                ? `\`\`\`${payload.result_full.substring(0, 950)}\`\`\`\n_Truncated (${payload.result_full.length} chars)_`
                                : `\`\`\`${payload.result_full}\`\`\``,
                        }]
                        : []),
                    ...(payload.error ? [{ name: 'Error', value: payload.error }] : []),
                ],
                timestamp: payload.timestamp,
            },
        ],
    };

    const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(discordBody),
        signal: AbortSignal.timeout(10000),
    });

    return { ok: resp.ok, statusCode: resp.status };
}

// ── Telegram ────────────────────────────────────────────────────────────────

async function deliverTelegram(
    route: OutputRoute,
    payload: WebhookPayload,
): Promise<{ ok: boolean; statusCode: number }> {
    const botToken = route.config.bot_token as string;
    const chatId = route.config.chat_id as string;
    const emoji = payload.status === 'completed' ? '✅' : '❌';

    let text = `${emoji} *${payload.team_run_id ? 'Team Run' : 'Task'} ${payload.status}*\n\n`;
    text += `*Title:* ${escapeMarkdown(payload.task_title)}\n`;
    text += `*${payload.team_run_id ? 'Team' : 'Agent'}:* ${escapeMarkdown(payload.agent_name)}\n`;

    if (payload.result_full) {
        const resultText = payload.result_full.length > 3500
            ? `${payload.result_full.substring(0, 3500)}\n\n... truncated (${payload.result_full.length} chars)`
            : payload.result_full;
        text += `\n\`\`\`\n${resultText}\n\`\`\``;
    }
    if (payload.error) {
        text += `\n⚠️ *Error:* ${escapeMarkdown(payload.error)}`;
    }

    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: 'MarkdownV2',
            disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(10000),
    });

    return { ok: resp.ok, statusCode: resp.status };
}

function escapeMarkdown(text: string): string {
    return text.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

// ── Microsoft Teams ─────────────────────────────────────────────────────────

async function deliverTeams(
    route: OutputRoute,
    payload: WebhookPayload,
): Promise<{ ok: boolean; statusCode: number }> {
    const url = route.config.webhook_url as string;
    const emoji = payload.status === 'completed' ? '✅' : '❌';

    // Build Adaptive Card payload for Teams Incoming Webhook
    const teamsBody = {
        type: 'message',
        attachments: [
            {
                contentType: 'application/vnd.microsoft.card.adaptive',
                content: {
                    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
                    type: 'AdaptiveCard',
                    version: '1.4',
                    body: [
                        {
                            type: 'TextBlock',
                            size: 'Medium',
                            weight: 'Bolder',
                            text: `${emoji} ${payload.team_run_id ? 'Team Run' : 'Task'} ${payload.status}`,
                            color: payload.status === 'completed' ? 'Good' : 'Attention',
                        },
                        {
                            type: 'FactSet',
                            facts: [
                                { title: payload.team_run_id ? 'Prompt' : 'Task', value: payload.task_title },
                                { title: payload.team_run_id ? 'Team' : 'Agent', value: payload.agent_name },
                                { title: 'Status', value: payload.status },
                            ],
                        },
                        ...(payload.result_full
                            ? [
                                {
                                    type: 'TextBlock',
                                    text: payload.result_full.length > 2000
                                        ? `${payload.result_full.substring(0, 2000)}\n\n... truncated (${payload.result_full.length} chars)`
                                        : payload.result_full,
                                    wrap: true,
                                    fontType: 'Monospace',
                                    size: 'Small',
                                },
                            ]
                            : []),
                        ...(payload.error
                            ? [
                                {
                                    type: 'TextBlock',
                                    text: `⚠️ Error: ${payload.error}`,
                                    color: 'Attention',
                                    wrap: true,
                                },
                            ]
                            : []),
                    ],
                },
            },
        ],
    };

    const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(teamsBody),
        signal: AbortSignal.timeout(10000),
    });

    return { ok: resp.ok, statusCode: resp.status };
}

// ── Asana ────────────────────────────────────────────────────────────────────

async function deliverAsana(
    route: OutputRoute,
    payload: WebhookPayload,
): Promise<{ ok: boolean; statusCode: number }> {
    const pat = route.config.pat as string;
    const projectGid = route.config.project_gid as string;

    const emoji = payload.status === 'completed' ? '✅' : '❌';

    // Build task notes with event details
    let notes = `${emoji} ${payload.event.replace('.', ' ').replace(/_/g, ' ')}\n\n`;
    notes += `Task: ${payload.task_title}\n`;
    notes += `Agent: ${payload.agent_name}\n`;
    notes += `Status: ${payload.status}\n`;
    notes += `Time: ${payload.timestamp}\n`;

    if (payload.result_full) {
        notes += `\n--- Result ---\n${payload.result_full}`;
    }
    if (payload.error) {
        notes += `\n⚠️ Error: ${payload.error}`;
    }

    const asanaBody = {
        data: {
            name: `[CrewForm] ${payload.task_title} — ${payload.status}`,
            notes,
            projects: [projectGid],
        },
    };

    const resp = await fetch('https://app.asana.com/api/1.0/tasks', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${pat}`,
        },
        body: JSON.stringify(asanaBody),
        signal: AbortSignal.timeout(10000),
    });

    return { ok: resp.ok, statusCode: resp.status };
}

// ── Trello ──────────────────────────────────────────────────────────────────

interface TrelloSection {
    title: string;
    content: string;
}

/**
 * Emoji lookup for Trello card titles based on section heading keywords.
 */
const SECTION_EMOJIS: [string, string][] = [
    ['architect',    '🏗️'],
    ['overview',     '🏗️'],
    ['database',     '🗄️'],
    ['schema',       '🗄️'],
    ['table',        '🗄️'],
    ['api',          '🔌'],
    ['endpoint',     '🔌'],
    ['route',        '🔌'],
    ['rest',         '🔌'],
    ['test',         '🧪'],
    ['qa',           '🧪'],
    ['quality',      '🧪'],
    ['sprint',       '📝'],
    ['story',        '📝'],
    ['stories',      '📝'],
    ['ticket',       '📝'],
    ['backlog',      '📝'],
    ['acceptance',   '📝'],
    ['security',     '🔒'],
    ['auth',         '🔐'],
    ['vulnerab',     '🔒'],
    ['implement',    '⚙️'],
    ['technical',    '⚙️'],
    ['decision',     '⚙️'],
    ['depend',       '🔗'],
    ['order',        '🔗'],
    ['risk',         '⚠️'],
    ['consider',     '💡'],
    ['recommend',    '💡'],
    ['librar',       '📦'],
];

function sectionEmoji(heading: string): string {
    const lower = heading.toLowerCase();
    for (const [keyword, emoji] of SECTION_EMOJIS) {
        if (lower.includes(keyword)) return emoji;
    }
    return '📄';
}

/**
 * Parse structured markdown output into logical sections for multi-card creation.
 * Splits by top-level headings (# or ##). Returns empty array if the output
 * doesn't have enough structure to justify splitting.
 */
function parseOutputSections(output: string): TrelloSection[] {
    // Strategy 1: Markdown headings (h1–h4)
    const headingRegex = /^(#{1,4})\s+(.+)$/gm;
    let matches = [...output.matchAll(headingRegex)];

    if (matches.length >= 2) {
        console.log(`[Trello] parseOutputSections: found ${matches.length} markdown headings`);
        return buildSectionsFromMatches(output, matches);
    }

    // Strategy 2: Bold-line section headers (e.g., **Section Name** on its own line)
    const boldRegex = /^\*\*([^*]{3,80})\*\*\s*$/gm;
    matches = [...output.matchAll(boldRegex)];

    if (matches.length >= 2) {
        console.log(`[Trello] parseOutputSections: found ${matches.length} bold-line sections`);
        return buildSectionsFromMatches(output, matches);
    }

    // Strategy 3: Horizontal rule separators (---)
    const parts = output.split(/\n---+\n/);
    if (parts.length >= 2) {
        console.log(`[Trello] parseOutputSections: found ${parts.length} separator-delimited sections`);
        const sections: TrelloSection[] = [];
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i].trim();
            if (!part) continue;

            // Try to extract a title from the first line
            const firstLine = part.split('\n')[0].trim()
                .replace(/^#+\s*/, '')      // strip leading #
                .replace(/^\*\*|\*\*$/g, '') // strip bold markers
                .substring(0, 80);
            const rest = part.substring(part.indexOf('\n') + 1).trim();

            sections.push({
                title: `${sectionEmoji(firstLine)} ${firstLine}`,
                content: rest || part,
            });
        }
        return sections.length >= 2 ? sections : [];
    }

    // Strategy 4: Large content with no clear structure — split by size
    if (output.length > 2000) {
        console.log(`[Trello] parseOutputSections: no structure found, splitting by paragraphs`);
        const paragraphs = output.split(/\n\n+/);
        const sections: TrelloSection[] = [];
        let currentContent = '';
        let sectionIndex = 1;

        for (const para of paragraphs) {
            if (currentContent.length + para.length > 4000 && currentContent.length > 500) {
                sections.push({
                    title: `📄 Part ${sectionIndex}`,
                    content: currentContent.trim(),
                });
                currentContent = para;
                sectionIndex++;
            } else {
                currentContent += (currentContent ? '\n\n' : '') + para;
            }
        }
        if (currentContent.trim()) {
            sections.push({
                title: `📄 Part ${sectionIndex}`,
                content: currentContent.trim(),
            });
        }
        return sections.length >= 2 ? sections : [];
    }

    return [];
}

function buildSectionsFromMatches(output: string, matches: RegExpMatchArray[]): TrelloSection[] {
    const sections: TrelloSection[] = [];

    // Preamble — any text before the first heading
    const preamble = output.substring(0, matches[0].index!).trim();
    if (preamble) {
        sections.push({ title: '📋 Overview', content: preamble });
    }

    // Each heading becomes a card
    for (let i = 0; i < matches.length; i++) {
        // Use capture group 2 if present (markdown headings), otherwise group 1 (bold)
        const heading = (matches[i][2] ?? matches[i][1]).trim();
        const contentStart = matches[i].index! + matches[i][0].length;
        const contentEnd = i + 1 < matches.length ? matches[i + 1].index! : output.length;
        const content = output.substring(contentStart, contentEnd).trim();

        sections.push({
            title: `${sectionEmoji(heading)} ${heading}`,
            content,
        });
    }

    return sections;
}

async function deliverTrello(
    route: OutputRoute,
    payload: WebhookPayload,
): Promise<{ ok: boolean; statusCode: number }> {
    const apiKey = route.config.api_key as string;
    const token = route.config.token as string;
    const listId = route.config.list_id as string;
    const reviewListId = route.config.review_list_id as string | undefined;

    const emoji = payload.status === 'completed' ? '✅' : '❌';
    const auth = `key=${encodeURIComponent(apiKey)}&token=${encodeURIComponent(token)}`;

    // Check if there's an existing card mapping (bidirectional flow)
    const taskOrRunId = payload.task_id ?? payload.team_run_id;
    let existingCardId: string | null = null;

    if (taskOrRunId) {
        const { data: mapping } = await supabase
            .from('trello_card_mappings')
            .select('trello_card_id')
            .or(`task_id.eq.${taskOrRunId},team_run_id.eq.${taskOrRunId}`)
            .limit(1)
            .maybeSingle();

        existingCardId = (mapping as { trello_card_id: string } | null)?.trello_card_id ?? null;
    }

    if (existingCardId) {
        // Update existing card: add comment with result
        const commentText = `${emoji} **${payload.status}**\n\n${payload.result_full || payload.error || 'No output'}`;
        const commentResp = await fetch(
            `https://api.trello.com/1/cards/${existingCardId}/actions/comments?${auth}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: commentText }),
                signal: AbortSignal.timeout(10000),
            },
        );

        // Move to review list if configured and task completed
        if (reviewListId && payload.status === 'completed') {
            await fetch(
                `https://api.trello.com/1/cards/${existingCardId}?${auth}`,
                {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ idList: reviewListId }),
                    signal: AbortSignal.timeout(10000),
                },
            );
        }

        return { ok: commentResp.ok, statusCode: commentResp.status };
    }

    // ── Create new cards ────────────────────────────────────────────────
    const output = payload.result_full || payload.error || 'No output';
    const targetList = reviewListId && payload.status === 'completed' ? reviewListId : listId;

    console.log(`[Trello] deliverTrello: result_full=${payload.result_full ? payload.result_full.length + ' chars' : 'null'}, output=${output.length} chars`);

    const sections = parseOutputSections(output);
    console.log(`[Trello] Parsed ${sections.length} sections from output`);

    if (sections.length >= 2) {
        // ── Multi-card creation: one card per markdown section ───────
        // 1. Summary card first
        const taskLabel = payload.task_title.length > 200
            ? payload.task_title.substring(0, 200) + '…'
            : payload.task_title;

        const summaryDesc = [
            `**${payload.team_run_id ? 'Team' : 'Agent'}:** ${payload.agent_name}`,
            `**Status:** ${payload.status}`,
            `**Event:** ${payload.event}`,
            `**Cards Created:** ${sections.length + 1}`,
            '',
            '---',
            '',
            `**Task:**`,
            payload.task_title,
            '',
            `> This run generated **${sections.length}** section cards below this summary.`,
        ].join('\n');

        const summaryResp = await fetch(
            `https://api.trello.com/1/cards?${auth}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    idList: targetList,
                    name: `${emoji} ${taskLabel}`,
                    desc: summaryDesc,
                    pos: 'bottom',
                }),
                signal: AbortSignal.timeout(10000),
            },
        );

        if (!summaryResp.ok) {
            return { ok: false, statusCode: summaryResp.status };
        }

        // 2. Section cards
        let lastStatus = summaryResp.status;
        let allOk = true;

        for (let i = 0; i < sections.length; i++) {
            const section = sections[i];
            const desc = section.content.length > 16384
                ? section.content.substring(0, 16384)
                : section.content;

            // Small delay between cards to stay within Trello rate limits
            await sleep(150);

            const resp = await fetch(
                `https://api.trello.com/1/cards?${auth}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        idList: targetList,
                        name: section.title,
                        desc,
                        pos: 'bottom',
                    }),
                    signal: AbortSignal.timeout(10000),
                },
            );

            lastStatus = resp.status;
            if (!resp.ok) {
                allOk = false;
                console.error(`[Trello] Failed to create card "${section.title}": ${resp.status}`);
                break;
            }
        }

        return { ok: allOk, statusCode: lastStatus };
    }

    // ── Fallback: single card (unstructured output) ─────────────────
    const description = [
        `**${payload.team_run_id ? 'Team' : 'Agent'}:** ${payload.agent_name}`,
        `**Status:** ${payload.status}`,
        `**Event:** ${payload.event}`,
        '',
        '---',
        '',
        output,
    ].join('\n');

    const resp = await fetch(
        `https://api.trello.com/1/cards?${auth}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                idList: targetList,
                name: `${emoji} ${payload.task_title}`,
                desc: description.length > 16384 ? description.substring(0, 16384) : description,
            }),
            signal: AbortSignal.timeout(10000),
        },
    );

    return { ok: resp.ok, statusCode: resp.status };
}

// ── Notion ──────────────────────────────────────────────────────────────────

/**
 * Deliver a webhook payload to Notion by creating a page in a database.
 *
 * Config fields:
 * - api_key: Notion Internal Integration Token (secret_xxx)
 * - database_id: Target database ID (32 hex chars, optionally with dashes)
 *
 * Creates a page with:
 * - Title property: task title with status emoji
 * - Status property (select): completed / failed / started
 * - Agent property (rich_text): agent name
 * - Page body: full result as paragraph blocks
 */
async function deliverNotion(
    route: OutputRoute,
    payload: WebhookPayload,
): Promise<{ ok: boolean; statusCode: number }> {
    const apiKey = route.config.api_key as string;
    const databaseId = route.config.database_id as string;

    if (!apiKey || !databaseId) {
        throw new Error('Notion integration requires api_key and database_id');
    }

    const emoji = payload.status === 'completed' ? '✅' : '❌';
    const output = payload.result_full || payload.error || 'No output';

    // Build page content blocks from the result (Notion max block size is 2000 chars)
    const contentBlocks = buildNotionBlocks(output);

    // Properties — we use common property names that most Notion databases will have.
    // Unknown properties are silently ignored by the API.
    const properties: Record<string, unknown> = {
        Name: {
            title: [
                {
                    text: {
                        content: `${emoji} ${payload.task_title}`.substring(0, 2000),
                    },
                },
            ],
        },
    };

    // Optional select property for status
    properties.Status = {
        select: { name: payload.status === 'completed' ? 'Done' : payload.status === 'failed' ? 'Failed' : 'In Progress' },
    };

    // Optional rich_text property for agent
    properties.Agent = {
        rich_text: [
            {
                text: {
                    content: payload.agent_name.substring(0, 2000),
                },
            },
        ],
    };

    // Optional rich_text property for event type
    properties.Event = {
        rich_text: [
            {
                text: {
                    content: payload.event,
                },
            },
        ],
    };

    const body = {
        parent: {
            type: 'database_id',
            database_id: databaseId,
        },
        properties,
        children: contentBlocks,
    };

    const resp = await fetch('https://api.notion.com/v1/pages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'Notion-Version': '2022-06-28',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
    });

    if (!resp.ok) {
        const errBody = await resp.text().catch(() => '');
        console.error(`[Notion] API error ${resp.status}: ${errBody.substring(0, 500)}`);
    }

    return { ok: resp.ok, statusCode: resp.status };
}

/**
 * Convert a text result into Notion block children.
 * Splits by paragraphs, respects the 2000-char limit per text block,
 * and preserves markdown headings as Notion heading blocks.
 */
function buildNotionBlocks(text: string): Record<string, unknown>[] {
    const blocks: Record<string, unknown>[] = [];
    const lines = text.split('\n');
    let currentParagraph = '';

    function flushParagraph() {
        if (!currentParagraph.trim()) return;
        const content = currentParagraph.trim();
        for (let i = 0; i < content.length; i += 2000) {
            blocks.push({
                object: 'block',
                type: 'paragraph',
                paragraph: {
                    rich_text: [
                        {
                            type: 'text',
                            text: { content: content.substring(i, i + 2000) },
                        },
                    ],
                },
            });
        }
        currentParagraph = '';
    }

    for (const line of lines) {
        const h1Match = /^#\s+(.+)$/.exec(line);
        const h2Match = /^##\s+(.+)$/.exec(line);
        const h3Match = /^###\s+(.+)$/.exec(line);

        if (h1Match) {
            flushParagraph();
            blocks.push({
                object: 'block',
                type: 'heading_1',
                heading_1: {
                    rich_text: [{ type: 'text', text: { content: h1Match[1].substring(0, 2000) } }],
                },
            });
        } else if (h2Match) {
            flushParagraph();
            blocks.push({
                object: 'block',
                type: 'heading_2',
                heading_2: {
                    rich_text: [{ type: 'text', text: { content: h2Match[1].substring(0, 2000) } }],
                },
            });
        } else if (h3Match) {
            flushParagraph();
            blocks.push({
                object: 'block',
                type: 'heading_3',
                heading_3: {
                    rich_text: [{ type: 'text', text: { content: h3Match[1].substring(0, 2000) } }],
                },
            });
        } else if (line.trim() === '') {
            flushParagraph();
        } else {
            currentParagraph += (currentParagraph ? '\n' : '') + line;
        }
    }

    flushParagraph();

    // Notion API limits children to 100 blocks per request
    return blocks.slice(0, 100);
}

// ── GitHub Issues ───────────────────────────────────────────────────────────

/**
 * Deliver a webhook payload to GitHub by creating an issue.
 *
 * Config fields:
 * - pat: GitHub Personal Access Token (fine-grained or classic)
 * - owner: Repository owner (user or org)
 * - repo: Repository name
 * - labels: Comma-separated label names (optional, e.g. "crewform,ai-output")
 *
 * Creates an issue with:
 * - Title: task title with status emoji
 * - Body: metadata header + full result as markdown
 * - Labels: user-configured labels + auto "crewform" label
 */
async function deliverGitHubIssue(
    route: OutputRoute,
    payload: WebhookPayload,
): Promise<{ ok: boolean; statusCode: number }> {
    const pat = route.config.pat as string;
    const owner = route.config.owner as string;
    const repo = route.config.repo as string;
    const labelsCsv = (route.config.labels as string) ?? '';

    if (!pat || !owner || !repo) {
        throw new Error('GitHub Issues integration requires pat, owner, and repo');
    }

    const emoji = payload.status === 'completed' ? '✅' : '❌';
    const output = payload.result_full || payload.error || 'No output';

    // Build labels array
    const labels: string[] = ['crewform'];
    if (labelsCsv.trim()) {
        for (const label of labelsCsv.split(',')) {
            const trimmed = label.trim();
            if (trimmed && !labels.includes(trimmed)) labels.push(trimmed);
        }
    }
    // Auto-add status label
    if (payload.status === 'failed') labels.push('bug');

    // Build issue body
    const isTeamRun = !!payload.team_run_id;
    const body = [
        `## ${emoji} ${isTeamRun ? 'Team Run' : 'Task'} ${payload.status}`,
        '',
        `| Field | Value |`,
        `|-------|-------|`,
        `| **${isTeamRun ? 'Team' : 'Agent'}** | ${payload.agent_name} |`,
        `| **Status** | ${payload.status} |`,
        `| **Event** | \`${payload.event}\` |`,
        `| **Timestamp** | ${payload.timestamp} |`,
        '',
        '---',
        '',
        '### Output',
        '',
        output.length > 60000
            ? `${output.substring(0, 60000)}\n\n> _Output truncated (${output.length} chars)_`
            : output,
        '',
        '---',
        '_Created by [CrewForm](https://crewform.tech) webhook integration_',
    ].join('\n');

    const resp = await fetch(
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${pat}`,
                'Accept': 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
                'User-Agent': 'CrewForm-Webhook/1.0',
            },
            body: JSON.stringify({
                title: `${emoji} ${payload.task_title}`.substring(0, 256),
                body,
                labels,
            }),
            signal: AbortSignal.timeout(15000),
        },
    );

    if (!resp.ok) {
        const errBody = await resp.text().catch(() => '');
        console.error(`[GitHub] API error ${resp.status}: ${errBody.substring(0, 500)}`);
    }

    return { ok: resp.ok, statusCode: resp.status };
}

// ── Email (Resend) ─────────────────────────────────────────────────────────

/**
 * Deliver a webhook payload via Resend (managed email API).
 *
 * Config fields:
 * - to: Comma-separated recipient email addresses
 * - subject: Optional subject template (supports {{title}}, {{status}} placeholders)
 *
 * Uses RESEND_API_KEY and RESEND_FROM_ADDRESS env vars.
 */
async function deliverEmail(
    route: OutputRoute,
    payload: WebhookPayload,
): Promise<{ ok: boolean; statusCode: number }> {
    const apiKey = process.env.RESEND_API_KEY;
    const fromAddress = process.env.RESEND_FROM_ADDRESS ?? 'CrewForm <noreply@crewform.tech>';
    const to = route.config.to as string;
    const subjectTemplate = (route.config.subject as string) ?? '{{status}} {{title}}';

    if (!apiKey) throw new Error('RESEND_API_KEY environment variable is not set');
    if (!to) throw new Error('Email destination requires "to" addresses');

    const recipients = to.split(',').map(e => e.trim()).filter(Boolean);
    const emoji = payload.status === 'completed' ? '✅' : '❌';

    const subject = `${emoji} ${subjectTemplate
        .replace(/\{\{title\}\}/g, payload.task_title)
        .replace(/\{\{status\}\}/g, payload.status)
        .replace(/\{\{agent\}\}/g, payload.agent_name)
    }`.substring(0, 200);

    const html = buildEmailHtml(payload);

    const resend = new Resend(apiKey);
    const { error: sendErr } = await resend.emails.send({
        from: fromAddress,
        to: recipients,
        subject,
        html,
    });

    if (sendErr) {
        console.error(`[Email] Resend error: ${sendErr.message}`);
        return { ok: false, statusCode: 400 };
    }

    return { ok: true, statusCode: 200 };
}

// ── SMTP ─────────────────────────────────────────────────────────────────

/**
 * Deliver a webhook payload via raw SMTP (nodemailer).
 * Ideal for self-hosted users with their own mail server.
 *
 * Config fields:
 * - host: SMTP server hostname (e.g. smtp.gmail.com)
 * - port: SMTP port (587 for TLS, 465 for SSL, 25 for plain)
 * - user: SMTP username
 * - pass: SMTP password
 * - from: Sender address (e.g. "CrewForm <noreply@example.com>")
 * - to: Comma-separated recipient email addresses
 * - subject: Optional subject template (supports {{title}}, {{status}} placeholders)
 * - tls: "true" or "false" (default: true)
 */
async function deliverSmtp(
    route: OutputRoute,
    payload: WebhookPayload,
): Promise<{ ok: boolean; statusCode: number }> {
    const host = route.config.host as string;
    const port = parseInt((route.config.port as string) ?? '587', 10);
    const user = route.config.user as string;
    const pass = route.config.pass as string;
    const from = route.config.from as string;
    const to = route.config.to as string;
    const subjectTemplate = (route.config.subject as string) ?? '{{status}} {{title}}';
    const useTls = (route.config.tls as string) !== 'false';

    if (!host || !from || !to) {
        throw new Error('SMTP destination requires host, from, and to');
    }

    const recipients = to.split(',').map(e => e.trim()).filter(Boolean);
    const emoji = payload.status === 'completed' ? '✅' : '❌';

    const subject = `${emoji} ${subjectTemplate
        .replace(/\{\{title\}\}/g, payload.task_title)
        .replace(/\{\{status\}\}/g, payload.status)
        .replace(/\{\{agent\}\}/g, payload.agent_name)
    }`.substring(0, 200);

    const html = buildEmailHtml(payload);

    const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: user ? { user, pass } : undefined,
        tls: useTls ? { rejectUnauthorized: false } : undefined,
    });

    try {
        await transporter.sendMail({
            from,
            to: recipients.join(', '),
            subject,
            html,
        });
        return { ok: true, statusCode: 200 };
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[SMTP] Send error: ${msg}`);
        return { ok: false, statusCode: 500 };
    }
}

// ── Shared email HTML builder ───────────────────────────────────────────────

function buildEmailHtml(payload: WebhookPayload): string {
    const emoji = payload.status === 'completed' ? '✅' : '❌';
    const statusColor = payload.status === 'completed' ? '#22c55e' : '#ef4444';
    const isTeamRun = !!payload.team_run_id;
    const output = payload.result_full || payload.error || 'No output';
    const truncated = output.length > 50000
        ? `${output.substring(0, 50000)}\n\n... truncated (${output.length} chars)`
        : output;

    return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 640px; margin: 0 auto; color: #1a1a2e;">
        <div style="background: ${statusColor}; color: white; padding: 16px 24px; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0; font-size: 18px;">${emoji} ${escapeHtml(payload.task_title)}</h1>
        </div>
        <div style="border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 14px;">
                <tr>
                    <td style="padding: 6px 12px 6px 0; color: #6b7280; font-weight: 600;">${isTeamRun ? 'Team' : 'Agent'}</td>
                    <td style="padding: 6px 0;">${escapeHtml(payload.agent_name)}</td>
                </tr>
                <tr>
                    <td style="padding: 6px 12px 6px 0; color: #6b7280; font-weight: 600;">Status</td>
                    <td style="padding: 6px 0;"><span style="color: ${statusColor}; font-weight: 600;">${payload.status}</span></td>
                </tr>
                <tr>
                    <td style="padding: 6px 12px 6px 0; color: #6b7280; font-weight: 600;">Event</td>
                    <td style="padding: 6px 0;"><code style="background: #f4f4f5; padding: 2px 6px; border-radius: 4px; font-size: 13px;">${payload.event}</code></td>
                </tr>
                <tr>
                    <td style="padding: 6px 12px 6px 0; color: #6b7280; font-weight: 600;">Time</td>
                    <td style="padding: 6px 0;">${new Date(payload.timestamp).toLocaleString()}</td>
                </tr>
            </table>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
            <div style="background: #f9fafb; border-radius: 8px; padding: 16px; white-space: pre-wrap; font-size: 13px; line-height: 1.6; overflow-x: auto; max-height: 600px; overflow-y: auto;">
${escapeHtml(truncated)}
            </div>
            <p style="color: #9ca3af; font-size: 11px; margin-top: 16px; text-align: center;">
                Sent by <a href="https://crewform.tech" style="color: #6366f1;">CrewForm</a>
            </p>
        </div>
    </div>`;
}

// ── Linear ──────────────────────────────────────────────────────────────────

/**
 * Deliver a webhook payload to Linear by creating an issue via GraphQL.
 *
 * Config fields:
 * - api_key: Linear API key (personal or workspace)
 * - team_id: Linear team UUID to create the issue in
 * - labels: Comma-separated label names (optional)
 *
 * Creates an issue with:
 * - Title: task title with status emoji
 * - Description: metadata + full result as markdown
 * - Labels: matched by name against existing team labels
 */
async function deliverLinear(
    route: OutputRoute,
    payload: WebhookPayload,
): Promise<{ ok: boolean; statusCode: number }> {
    const apiKey = route.config.api_key as string;
    const teamId = route.config.team_id as string;
    const labelsCsv = (route.config.labels as string) ?? '';

    if (!apiKey || !teamId) {
        throw new Error('Linear integration requires api_key and team_id');
    }

    const emoji = payload.status === 'completed' ? '✅' : '❌';
    const output = payload.result_full || payload.error || 'No output';
    const isTeamRun = !!payload.team_run_id;

    const title = `${emoji} ${payload.task_title}`.substring(0, 256);

    const description = [
        `## ${emoji} ${isTeamRun ? 'Team Run' : 'Task'} ${payload.status}`,
        '',
        `| Field | Value |`,
        `|-------|-------|`,
        `| **${isTeamRun ? 'Team' : 'Agent'}** | ${payload.agent_name} |`,
        `| **Status** | ${payload.status} |`,
        `| **Event** | \`${payload.event}\` |`,
        `| **Timestamp** | ${payload.timestamp} |`,
        '',
        '---',
        '',
        output.length > 60000
            ? `${output.substring(0, 60000)}\n\n> _Output truncated (${output.length} chars)_`
            : output,
        '',
        '---',
        '_Created by [CrewForm](https://crewform.tech)_',
    ].join('\n');

    // Resolve label IDs by name if labels are specified
    let labelIds: string[] | undefined;
    if (labelsCsv.trim()) {
        const labelNames = labelsCsv.split(',').map(l => l.trim().toLowerCase()).filter(Boolean);
        try {
            const labelsResp = await fetch('https://api.linear.app/graphql', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': apiKey,
                },
                body: JSON.stringify({
                    query: `query { issueLabels(filter: { team: { id: { eq: "${teamId}" } } }) { nodes { id name } } }`,
                }),
                signal: AbortSignal.timeout(10000),
            });
            if (labelsResp.ok) {
                const labelsData = await labelsResp.json() as { data?: { issueLabels?: { nodes?: { id: string; name: string }[] } } };
                const allLabels = labelsData.data?.issueLabels?.nodes ?? [];
                labelIds = allLabels
                    .filter(l => labelNames.includes(l.name.toLowerCase()))
                    .map(l => l.id);
            }
        } catch {
            // Label resolution failure is non-fatal — create issue without labels
            console.warn('[Linear] Failed to resolve labels, creating issue without them');
        }
    }

    const mutation = `mutation IssueCreate($input: IssueCreateInput!) {
        issueCreate(input: $input) {
            success
            issue { id identifier url }
        }
    }`;

    const variables: Record<string, unknown> = {
        input: {
            teamId,
            title,
            description,
            ...(labelIds && labelIds.length > 0 ? { labelIds } : {}),
        },
    };

    const resp = await fetch('https://api.linear.app/graphql', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': apiKey,
        },
        body: JSON.stringify({ query: mutation, variables }),
        signal: AbortSignal.timeout(15000),
    });

    if (!resp.ok) {
        const errBody = await resp.text().catch(() => '');
        console.error(`[Linear] API error ${resp.status}: ${errBody.substring(0, 500)}`);
        return { ok: false, statusCode: resp.status };
    }

    const result = await resp.json() as { data?: { issueCreate?: { success: boolean } }; errors?: { message: string }[] };
    if (result.errors?.length) {
        console.error(`[Linear] GraphQL errors: ${result.errors.map(e => e.message).join(', ')}`);
        return { ok: false, statusCode: 422 };
    }

    const success = result.data?.issueCreate?.success ?? false;
    return { ok: success, statusCode: success ? 200 : 422 };
}

// ── Google Workspace (shared token helper) ───────────────────────────────────

/**
 * Get a valid Google access token for a workspace.
 * Automatically refreshes expired tokens using the stored refresh_token.
 */
async function getGoogleAccessToken(workspaceId: string): Promise<string> {
    const { data: conn, error } = await supabase
        .from('google_connections')
        .select('access_token, refresh_token, token_expiry')
        .eq('workspace_id', workspaceId)
        .single();

    if (error || !conn) {
        throw new Error('Google is not connected for this workspace. Go to Settings → Webhooks to connect.');
    }

    const { access_token, refresh_token, token_expiry } = conn as {
        access_token: string;
        refresh_token: string;
        token_expiry: string;
    };

    // If token is still valid (with 60s buffer), return it
    if (new Date(token_expiry).getTime() > Date.now() + 60_000) {
        return access_token;
    }

    // Refresh the token
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        throw new Error('Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET env vars.');
    }

    const resp = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refresh_token,
            grant_type: 'refresh_token',
        }),
        signal: AbortSignal.timeout(10000),
    });

    if (!resp.ok) {
        const errBody = await resp.text().catch(() => '');
        console.error(`[Google] Token refresh failed ${resp.status}: ${errBody.substring(0, 500)}`);
        throw new Error('Failed to refresh Google access token. User may need to re-connect.');
    }

    const tokens = await resp.json() as {
        access_token: string;
        expires_in: number;
    };

    const newExpiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    // Update stored token
    await supabase
        .from('google_connections')
        .update({
            access_token: tokens.access_token,
            token_expiry: newExpiry,
            updated_at: new Date().toISOString(),
        })
        .eq('workspace_id', workspaceId);

    return tokens.access_token;
}

// ── Google Sheets ────────────────────────────────────────────────────────────

/**
 * Append a row to a Google Sheets spreadsheet.
 *
 * Config fields:
 * - spreadsheet_id: The spreadsheet ID from the URL (required)
 * - sheet_name: Sheet tab name (optional, default "Sheet1")
 */
async function deliverGoogleSheets(
    route: OutputRoute,
    payload: WebhookPayload,
): Promise<{ ok: boolean; statusCode: number }> {
    const spreadsheetId = route.config.spreadsheet_id as string;
    const sheetName = (route.config.sheet_name as string) || 'Sheet1';

    if (!spreadsheetId) {
        throw new Error('Google Sheets integration requires spreadsheet_id');
    }

    const accessToken = await getGoogleAccessToken(route.workspace_id);
    const output = payload.result_full || payload.error || 'No output';
    const preview = output.length > 5000 ? `${output.substring(0, 5000)}...` : output;

    const values = [[
        payload.timestamp,
        payload.agent_name,
        payload.task_title,
        payload.status,
        payload.event,
        preview,
    ]];

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(sheetName)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;

    const resp = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ values }),
        signal: AbortSignal.timeout(15000),
    });

    if (!resp.ok) {
        const errBody = await resp.text().catch(() => '');
        console.error(`[Google Sheets] API error ${resp.status}: ${errBody.substring(0, 500)}`);
    }

    return { ok: resp.ok, statusCode: resp.status };
}

// ── Google Gmail ─────────────────────────────────────────────────────────────

/**
 * Send an email via the user's connected Gmail account.
 *
 * Config fields:
 * - to: Comma-separated recipient emails (required)
 * - subject: Subject template with {{title}}, {{status}}, {{agent}} (optional)
 */
async function deliverGoogleGmail(
    route: OutputRoute,
    payload: WebhookPayload,
): Promise<{ ok: boolean; statusCode: number }> {
    const to = route.config.to as string;
    const subjectTemplate = (route.config.subject as string) || '{{status}} {{title}}';

    if (!to) {
        throw new Error('Gmail integration requires at least one recipient email (to)');
    }

    const accessToken = await getGoogleAccessToken(route.workspace_id);
    const output = payload.result_full || payload.error || 'No output';
    const isTeamRun = !!payload.team_run_id;

    const subject = subjectTemplate
        .replace(/\{\{title\}\}/g, payload.task_title)
        .replace(/\{\{status\}\}/g, payload.status === 'completed' ? '✅' : '❌')
        .replace(/\{\{agent\}\}/g, payload.agent_name);

    const htmlBody = buildEmailHtml(payload);

    // Build RFC 2822 MIME message
    const mimeMessage = [
        `To: ${to}`,
        `Subject: ${subject}`,
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset=UTF-8',
        '',
        htmlBody,
    ].join('\r\n');

    // base64url encode
    const encoded = Buffer.from(mimeMessage)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

    const resp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ raw: encoded }),
        signal: AbortSignal.timeout(15000),
    });

    if (!resp.ok) {
        const errBody = await resp.text().catch(() => '');
        console.error(`[Gmail] API error ${resp.status}: ${errBody.substring(0, 500)}`);
    }

    return { ok: resp.ok, statusCode: resp.status };
}

// ── Google Docs ──────────────────────────────────────────────────────────────

/**
 * Create a Google Doc with the full agent output.
 *
 * Config fields:
 * - folder_id: Target Google Drive folder ID (optional, uses root if omitted)
 */
async function deliverGoogleDocs(
    route: OutputRoute,
    payload: WebhookPayload,
): Promise<{ ok: boolean; statusCode: number }> {
    const folderId = route.config.folder_id as string;
    const accessToken = await getGoogleAccessToken(route.workspace_id);
    const output = payload.result_full || payload.error || 'No output';
    const isTeamRun = !!payload.team_run_id;
    const emoji = payload.status === 'completed' ? '✅' : '❌';

    const docTitle = `${emoji} ${isTeamRun ? 'Team Run' : 'Task'}: ${payload.task_title} — ${new Date(payload.timestamp).toLocaleDateString()}`;

    // Step 1: Create the document
    const createResp = await fetch('https://docs.googleapis.com/v1/documents', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ title: docTitle }),
        signal: AbortSignal.timeout(15000),
    });

    if (!createResp.ok) {
        const errBody = await createResp.text().catch(() => '');
        console.error(`[Google Docs] Create error ${createResp.status}: ${errBody.substring(0, 500)}`);
        return { ok: false, statusCode: createResp.status };
    }

    const doc = await createResp.json() as { documentId: string };
    const documentId = doc.documentId;

    // Step 2: Insert content
    const contentText = [
        `Agent: ${payload.agent_name}`,
        `Status: ${payload.status}`,
        `Event: ${payload.event}`,
        `Timestamp: ${payload.timestamp}`,
        '',
        '---',
        '',
        output.length > 100000 ? `${output.substring(0, 100000)}\n\n[Output truncated — ${output.length} chars total]` : output,
        '',
        '---',
        'Created by CrewForm (https://crewform.tech)',
    ].join('\n');

    await fetch(`https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
            requests: [{
                insertText: {
                    location: { index: 1 },
                    text: contentText,
                },
            }],
        }),
        signal: AbortSignal.timeout(15000),
    });

    // Step 3: Move to folder if specified
    if (folderId) {
        try {
            // Get current parents
            const fileResp = await fetch(
                `https://www.googleapis.com/drive/v3/files/${documentId}?fields=parents`,
                {
                    headers: { Authorization: `Bearer ${accessToken}` },
                    signal: AbortSignal.timeout(10000),
                },
            );
            if (fileResp.ok) {
                const fileData = await fileResp.json() as { parents?: string[] };
                const currentParents = fileData.parents?.join(',') ?? '';

                await fetch(
                    `https://www.googleapis.com/drive/v3/files/${documentId}?addParents=${encodeURIComponent(folderId)}&removeParents=${encodeURIComponent(currentParents)}`,
                    {
                        method: 'PATCH',
                        headers: { Authorization: `Bearer ${accessToken}` },
                        signal: AbortSignal.timeout(10000),
                    },
                );
            }
        } catch {
            // Folder move failure is non-fatal
            console.warn('[Google Docs] Failed to move document to folder, document created in root');
        }
    }

    return { ok: true, statusCode: 200 };
}

// ── Google Calendar ──────────────────────────────────────────────────────────

/**
 * Create a Google Calendar event to review agent output.
 *
 * Config fields:
 * - calendar_id: Calendar ID (optional, default "primary")
 * - duration_minutes: Event duration in minutes (optional, default 30)
 */
async function deliverGoogleCalendar(
    route: OutputRoute,
    payload: WebhookPayload,
): Promise<{ ok: boolean; statusCode: number }> {
    const calendarId = (route.config.calendar_id as string) || 'primary';
    const durationMinutes = parseInt(String(route.config.duration_minutes ?? '30'), 10) || 30;
    const accessToken = await getGoogleAccessToken(route.workspace_id);
    const isTeamRun = !!payload.team_run_id;
    const emoji = payload.status === 'completed' ? '✅' : '❌';

    const summary = `${emoji} Review: ${payload.task_title}`;
    const description = [
        `${isTeamRun ? 'Team' : 'Agent'}: ${payload.agent_name}`,
        `Status: ${payload.status}`,
        `Event: ${payload.event}`,
        '',
        'Preview:',
        (payload.result_full || payload.error || 'No output').substring(0, 2000),
        '',
        'Created by CrewForm (https://crewform.tech)',
    ].join('\n');

    // Schedule 1 hour from now
    const startTime = new Date(Date.now() + 60 * 60 * 1000);
    const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);

    const resp = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
                summary,
                description,
                start: { dateTime: startTime.toISOString() },
                end: { dateTime: endTime.toISOString() },
                reminders: {
                    useDefault: false,
                    overrides: [
                        { method: 'popup', minutes: 10 },
                    ],
                },
            }),
            signal: AbortSignal.timeout(15000),
        },
    );

    if (!resp.ok) {
        const errBody = await resp.text().catch(() => '');
        console.error(`[Google Calendar] API error ${resp.status}: ${errBody.substring(0, 500)}`);
    }

    return { ok: resp.ok, statusCode: resp.status };
}

// ─── Logging ────────────────────────────────────────────────────────────────

async function logDelivery(
    routeId: string,
    taskId: string,
    event: string,
    status: 'success' | 'failed',
    statusCode: number | null,
    error: string | null,
    payload: WebhookPayload,
): Promise<void> {
    try {
        await supabase.from('webhook_logs').insert({
            route_id: routeId,
            task_id: taskId,
            event,
            status,
            status_code: statusCode,
            error,
            payload,
        });
    } catch (logErr: unknown) {
        console.error('[Webhooks] Failed to write log:', logErr instanceof Error ? logErr.message : String(logErr));
    }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Source Channel Reply ───────────────────────────────────────────────────

interface SourceChannel {
    platform: 'telegram' | 'discord' | 'slack' | 'email' | 'trello' | 'linear';
    bot_token?: string;
    chat_id?: string;
    message_id?: string;
    channel_id?: string;
    thread_ts?: string;
    guild_id?: string;
    from_email?: string;
    subject?: string;
    channel_db_id?: string;
    // Trello-specific
    trello_card_id?: string;
    trello_api_key?: string;
    trello_token?: string;
    trello_review_list_id?: string;
    // Linear-specific
    linear_issue_id?: string;
    linear_api_key?: string;
    linear_done_state_name?: string;
}

/**
 * Reply to the originating messaging channel after a task completes.
 * Reads source_channel JSONB from the task, delivers the response,
 * and logs to channel_message_log. Never throws.
 */
export async function replyToSourceChannel(
    taskId: string,
    result: string | null,
    error: string | null,
    status: string,
): Promise<void> {
    try {
        // Read source_channel from the task
        const { data, error: fetchErr } = await supabase
            .from('tasks')
            .select('source_channel, title')
            .eq('id', taskId)
            .single();

        if (fetchErr || !data) return;
        const row = data as { source_channel: SourceChannel | null; title: string };
        if (!row.source_channel) return;

        const sc = row.source_channel;
        const isSuccess = status === 'completed';
        const emoji = isSuccess ? '✅' : '❌';
        const content = isSuccess
            ? (result ?? 'Task completed with no output.')
            : `Error: ${error ?? 'Unknown error'}`;

        let delivered = false;
        let deliveryError: string | null = null;

        try {
            switch (sc.platform) {
                case 'telegram':
                    delivered = await replyTelegram(sc, emoji, row.title, content);
                    break;
                case 'discord':
                    delivered = await replyDiscord(sc, emoji, row.title, content);
                    break;
                case 'slack':
                    delivered = await replySlack(sc, emoji, row.title, content);
                    break;
                case 'email':
                    delivered = await replyEmail(sc, emoji, row.title, content);
                    break;
                case 'trello':
                    delivered = await replyTrello(sc, emoji, row.title, content);
                    break;
                case 'linear':
                    delivered = await replyLinear(sc, emoji, row.title, content);
                    break;
                default:
                    return;
            }
        } catch (err: unknown) {
            deliveryError = err instanceof Error ? err.message : String(err);
            console.error(`[SourceChannel] Failed to reply on ${sc.platform} for task ${taskId}:`, deliveryError);
        }

        // Log to channel_message_log
        if (sc.channel_db_id) {
            await supabase.from('channel_message_log').insert({
                channel_id: sc.channel_db_id,
                direction: 'outbound',
                task_id: taskId,
                message_preview: content.substring(0, 200),
                status: delivered ? 'delivered' : 'failed',
                error: deliveryError,
            });
        }
    } catch (err: unknown) {
        console.error('[SourceChannel] Unexpected error:', err instanceof Error ? err.message : String(err));
    }
}

async function replyTelegram(sc: SourceChannel, emoji: string, title: string, content: string): Promise<boolean> {
    if (!sc.bot_token || !sc.chat_id) return false;

    let text = `${emoji} *${escapeMarkdown(title)}*\n\n`;
    if (content.length > 3500) {
        text += `\`\`\`\n${content.substring(0, 3500)}\n\`\`\`\n\n_...truncated (${content.length} chars)_`;
    } else {
        text += content;
    }

    const resp = await fetch(`https://api.telegram.org/bot${sc.bot_token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: sc.chat_id,
            text,
            parse_mode: 'Markdown',
            reply_to_message_id: sc.message_id ? parseInt(sc.message_id, 10) : undefined,
            disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(10000),
    });

    return resp.ok;
}

async function replyDiscord(sc: SourceChannel, emoji: string, title: string, content: string): Promise<boolean> {
    if (!sc.bot_token || !sc.channel_id) return false;

    const truncated = content.length > 1900
        ? `${content.substring(0, 1900)}\n\n... truncated (${content.length} chars)`
        : content;

    const body: Record<string, unknown> = {
        embeds: [{
            title: `${emoji} ${title}`,
            description: truncated,
            color: emoji === '✅' ? 0x22c55e : 0xef4444,
            timestamp: new Date().toISOString(),
        }],
    };

    if (sc.message_id) {
        body.message_reference = { message_id: sc.message_id };
    }

    const resp = await fetch(`https://discord.com/api/v10/channels/${sc.channel_id}/messages`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bot ${sc.bot_token}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
    });

    return resp.ok;
}

async function replySlack(sc: SourceChannel, emoji: string, title: string, content: string): Promise<boolean> {
    if (!sc.bot_token || !sc.channel_id) return false;

    const truncated = content.length > 2900
        ? `${content.substring(0, 2900)}\n\n... truncated (${content.length} chars)`
        : content;

    const body: Record<string, unknown> = {
        channel: sc.channel_id,
        text: `${emoji} *${title}*`,
        blocks: [
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `${emoji} *${title}*\n\n${truncated}`,
                },
            },
        ],
    };

    if (sc.thread_ts) {
        body.thread_ts = sc.thread_ts;
    }

    const resp = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${sc.bot_token}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
    });

    return resp.ok;
}

async function replyEmail(sc: SourceChannel, emoji: string, title: string, content: string): Promise<boolean> {
    const apiKey = process.env.RESEND_API_KEY;
    const fromAddress = process.env.RESEND_FROM_ADDRESS ?? 'CrewForm <noreply@crewform.tech>';

    if (!apiKey || !sc.from_email) return false;

    const resend = new Resend(apiKey);

    const truncated = content.length > 10000
        ? `${content.substring(0, 10000)}\n\n... truncated (${content.length} chars)`
        : content;

    const htmlBody = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px;">
            <h2>${emoji} ${escapeHtml(title)}</h2>
            <div style="background: #f4f4f5; border-radius: 8px; padding: 16px; white-space: pre-wrap; font-size: 14px; line-height: 1.6;">
${escapeHtml(truncated)}
            </div>
            <p style="color: #71717a; font-size: 12px; margin-top: 16px;">
                Sent by CrewForm
            </p>
        </div>
    `;

    const { error: sendErr } = await resend.emails.send({
        from: fromAddress,
        to: sc.from_email,
        subject: `Re: ${sc.subject ?? title}`,
        html: htmlBody,
    });

    if (sendErr) {
        console.error('[SourceChannel] Resend error:', sendErr.message);
        return false;
    }

    return true;
}

async function replyTrello(sc: SourceChannel, emoji: string, title: string, content: string): Promise<boolean> {
    if (!sc.trello_api_key || !sc.trello_token || !sc.trello_card_id) return false;

    const auth = `key=${sc.trello_api_key}&token=${sc.trello_token}`;

    const truncated = content.length > 16000
        ? `${content.substring(0, 16000)}\n\n... truncated (${content.length} chars)`
        : content;

    const commentText = `${emoji} **${title}**\n\n${truncated}`;

    const resp = await fetch(
        `https://api.trello.com/1/cards/${sc.trello_card_id}/actions/comments?${auth}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: commentText }),
            signal: AbortSignal.timeout(10000),
        },
    );

    // Move card to review list if configured
    if (sc.trello_review_list_id && resp.ok) {
        await fetch(
            `https://api.trello.com/1/cards/${sc.trello_card_id}?${auth}`,
            {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idList: sc.trello_review_list_id }),
                signal: AbortSignal.timeout(10000),
            },
        );
    }

    return resp.ok;
}

async function replyLinear(sc: SourceChannel, emoji: string, title: string, content: string): Promise<boolean> {
    if (!sc.linear_api_key || !sc.linear_issue_id) return false;

    const truncated = content.length > 10000
        ? `${content.substring(0, 10000)}\n\n... truncated (${content.length} chars)`
        : content;

    const commentBody = `${emoji} **${title}**\n\n${truncated}`;

    // Post comment on the issue
    const commentMutation = `
        mutation CommentCreate($input: CommentCreateInput!) {
            commentCreate(input: $input) {
                success
                comment { id }
            }
        }
    `;

    const commentResp = await fetch('https://api.linear.app/graphql', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: sc.linear_api_key,
        },
        body: JSON.stringify({
            query: commentMutation,
            variables: {
                input: {
                    issueId: sc.linear_issue_id,
                    body: commentBody,
                },
            },
        }),
        signal: AbortSignal.timeout(10000),
    });

    const commentResult = await commentResp.json();
    const commentSuccess = commentResult.data?.commentCreate?.success === true;

    if (!commentSuccess) {
        const errors = commentResult.errors?.map((e: { message: string }) => e.message).join(', ') ?? 'unknown error';
        console.error(`[Linear] Failed to post comment: ${errors}`);
        return false;
    }

    // Optionally move issue to done state
    if (sc.linear_done_state_name) {
        try {
            // Fetch the issue's team to find the target state
            const stateQuery = `
                query IssueTeamStates($issueId: String!) {
                    issue(id: $issueId) {
                        team {
                            states { nodes { id name type } }
                        }
                    }
                }
            `;

            const stateResp = await fetch('https://api.linear.app/graphql', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: sc.linear_api_key,
                },
                body: JSON.stringify({ query: stateQuery, variables: { issueId: sc.linear_issue_id } }),
                signal: AbortSignal.timeout(10000),
            });

            const stateResult = await stateResp.json();
            const states = stateResult.data?.issue?.team?.states?.nodes ?? [];
            const targetState = states.find(
                (s: { id: string; name: string }) => s.name.toLowerCase() === sc.linear_done_state_name!.toLowerCase(),
            );

            if (targetState) {
                const updateMutation = `
                    mutation IssueUpdate($id: String!, $input: IssueUpdateInput!) {
                        issueUpdate(id: $id, input: $input) { success }
                    }
                `;

                await fetch('https://api.linear.app/graphql', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: sc.linear_api_key,
                    },
                    body: JSON.stringify({
                        query: updateMutation,
                        variables: {
                            id: sc.linear_issue_id,
                            input: { stateId: targetState.id },
                        },
                    }),
                    signal: AbortSignal.timeout(10000),
                });

                console.log(`[Linear] Moved issue ${sc.linear_issue_id} to state "${sc.linear_done_state_name}"`);
            } else {
                console.warn(`[Linear] Done state "${sc.linear_done_state_name}" not found for issue ${sc.linear_issue_id}`);
            }
        } catch (err: unknown) {
            console.warn('[Linear] Failed to update issue state:', err instanceof Error ? err.message : String(err));
        }
    }

    return true;
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
