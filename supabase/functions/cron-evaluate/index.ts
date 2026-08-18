// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

/**
 * Cron Evaluate — serverless cron trigger evaluation.
 *
 * Called by Supabase pg_cron every minute.
 * Evaluates all enabled CRON triggers, creates executable work for any that
 * are due, and optionally pings the task runner to wake it up.
 *
 * This replaces the need for the Railway task runner to run 24/7 just for
 * cron evaluation. The task runner only needs to be running to execute tasks.
 *
 * Auth: CRON_SECRET header or service_role key.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// ─── Types ──────────────────────────────────────────────────────────────────

interface CronTriggerRow {
    id: string;
    agent_id: string | null;
    team_id: string | null;
    workspace_id: string;
    cron_expression: string;
    task_title_template: string;
    task_description_template: string;
    context_options: string[];
    last_fired_at: string | null;
    created_at: string;
}

// ─── CRON Parser (mirrored from triggerScheduler.ts) ────────────────────────

function matchesCronField(field: string, value: number, max: number): boolean {
    if (field === '*') return true;

    for (const part of field.split(',')) {
        if (part.includes('/')) {
            const [range, stepStr] = part.split('/');
            const step = parseInt(stepStr, 10);
            if (isNaN(step) || step <= 0) continue;

            let start = 0;
            let end = max;

            if (range !== '*') {
                if (range.includes('-')) {
                    const [s, e] = range.split('-');
                    start = parseInt(s, 10);
                    end = parseInt(e, 10);
                } else {
                    start = parseInt(range, 10);
                }
            }

            for (let i = start; i <= end; i += step) {
                if (i === value) return true;
            }
            continue;
        }

        if (part.includes('-')) {
            const [s, e] = part.split('-');
            const start = parseInt(s, 10);
            const end = parseInt(e, 10);
            if (value >= start && value <= end) return true;
            continue;
        }

        if (parseInt(part, 10) === value) return true;
    }

    return false;
}

function cronMatchesDate(expression: string, date: Date): boolean {
    const parts = expression.trim().split(/\s+/);
    if (parts.length !== 5) return false;

    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

    return (
        matchesCronField(minute, date.getMinutes(), 59) &&
        matchesCronField(hour, date.getHours(), 23) &&
        matchesCronField(dayOfMonth, date.getDate(), 31) &&
        matchesCronField(month, date.getMonth() + 1, 12) &&
        matchesCronField(dayOfWeek, date.getDay(), 6)
    );
}

const MAX_CATCHUP_MS = 48 * 60 * 60 * 1000;

function isTriggerDue(cronExpression: string, lastFiredAt: string | null, createdAt: string): boolean {
    const now = new Date();

    // Current-minute match
    if (cronMatchesDate(cronExpression, now)) {
        if (lastFiredAt) {
            const last = new Date(lastFiredAt);
            if (
                last.getFullYear() === now.getFullYear() &&
                last.getMonth() === now.getMonth() &&
                last.getDate() === now.getDate() &&
                last.getHours() === now.getHours() &&
                last.getMinutes() === now.getMinutes()
            ) {
                return false;
            }
        }
        return true;
    }

    // Catch-up: check for missed firings since last fire, or trigger creation.
    const baseline = new Date(lastFiredAt ?? createdAt);
    const gapMs = now.getTime() - baseline.getTime();

    if (gapMs < 2 * 60 * 1000) return false;

    const lookbackStart = new Date(Math.max(baseline.getTime(), now.getTime() - MAX_CATCHUP_MS));
    const scanTime = new Date(lookbackStart);
    scanTime.setSeconds(0, 0);
    scanTime.setMinutes(scanTime.getMinutes() + 1);

    while (scanTime < now) {
        if (cronMatchesDate(cronExpression, scanTime)) {
            console.log(
                `[CronEvaluate] Catch-up: missed firing at ${scanTime.toISOString()} ` +
                `(baseline: ${lastFiredAt ?? createdAt}, now: ${now.toISOString()})`,
            );
            return true;
        }
        scanTime.setMinutes(scanTime.getMinutes() + 1);
    }

    return false;
}

async function resolveWorkspaceOwner(
    db: ReturnType<typeof createClient<any>>,
    workspaceId: string,
): Promise<string> {
    const { data, error } = await db
        .from('workspaces')
        .select('owner_id')
        .eq('id', workspaceId)
        .single();

    if (error || !data) {
        throw new Error(`Could not resolve workspace owner: ${error?.message ?? 'workspace not found'}`);
    }

    return (data as { owner_id: string }).owner_id;
}

// ─── Template Rendering ─────────────────────────────────────────────────────

function renderTemplate(template: string): string {
    const now = new Date();
    return template
        .replace(/\{\{date\}\}/g, now.toISOString().split('T')[0])
        .replace(/\{\{time\}\}/g, now.toTimeString().split(' ')[0])
        .replace(/\{\{datetime\}\}/g, now.toISOString());
}

// ─── Main Handler ───────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const cronSecret = Deno.env.get('CRON_SECRET');
    const incomingSecret = req.headers.get('x-cron-secret');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const bearer = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    const validCronSecret = !!cronSecret && incomingSecret === cronSecret;
    const validServiceRole = !!serviceRoleKey && bearer === serviceRoleKey;
    if (!validCronSecret && !validServiceRole) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const db = createClient(supabaseUrl, serviceRoleKey);

        // Fetch all enabled CRON triggers
        const { data: triggers, error: fetchError } = await db
            .from('agent_triggers')
            .select('id, agent_id, team_id, workspace_id, cron_expression, task_title_template, task_description_template, context_options, last_fired_at, created_at')
            .eq('trigger_type', 'cron')
            .eq('enabled', true)
            .not('cron_expression', 'is', null);

        if (fetchError) {
            console.error('[CronEvaluate] Error fetching triggers:', fetchError.message);
            return new Response(JSON.stringify({ error: fetchError.message }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const rows = (triggers ?? []) as CronTriggerRow[];
        if (rows.length === 0) {
            return new Response(JSON.stringify({ evaluated: 0, fired: 0 }), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        let fired = 0;
        let firedTasks = 0;
        let firedTeamRuns = 0;
        const firedTriggerIds: string[] = [];
        const taskIds: string[] = [];
        const teamRunIds: string[] = [];

        for (const trigger of rows) {
            try {
                if (!isTriggerDue(trigger.cron_expression, trigger.last_fired_at, trigger.created_at)) continue;

                const target = trigger.team_id ? `team ${trigger.team_id}` : `agent ${trigger.agent_id}`;
                console.log(`[CronEvaluate] Firing trigger ${trigger.id} for ${target}`);

                const title = renderTemplate(trigger.task_title_template);
                const description = renderTemplate(trigger.task_description_template);
                const ownerId = await resolveWorkspaceOwner(db, trigger.workspace_id);

                let taskId: string | null = null;
                let teamRunId: string | null = null;

                if (trigger.team_id) {
                    const inputTask = description ? `${title}\n\n${description}` : title;
                    const runResult = await db
                        .from('team_runs')
                        .insert({
                            workspace_id: trigger.workspace_id,
                            team_id: trigger.team_id,
                            input_task: inputTask,
                            status: 'pending',
                            created_by: ownerId,
                        })
                        .select('id')
                        .single();

                    if (runResult.error) {
                        await db.from('trigger_log').insert({
                            trigger_id: trigger.id,
                            status: 'failed',
                            error: runResult.error.message,
                        });
                        console.error(`[CronEvaluate] Failed to create team run for trigger ${trigger.id}:`, runResult.error.message);
                        continue;
                    }

                    teamRunId = (runResult.data as { id: string }).id;
                    firedTeamRuns++;
                    teamRunIds.push(teamRunId);
                } else if (trigger.agent_id) {
                    const taskResult = await db
                        .from('tasks')
                        .insert({
                            workspace_id: trigger.workspace_id,
                            title,
                            description,
                            assigned_agent_id: trigger.agent_id,
                            status: 'dispatched',
                            priority: 'medium',
                            created_by: ownerId,
                            scheduled_for: new Date().toISOString(),
                            metadata: {
                                source: 'cron_trigger',
                                trigger_id: trigger.id,
                            },
                        })
                        .select('id')
                        .single();

                    if (taskResult.error) {
                        await db.from('trigger_log').insert({
                            trigger_id: trigger.id,
                            status: 'failed',
                            error: taskResult.error.message,
                        });
                        console.error(`[CronEvaluate] Failed to create task for trigger ${trigger.id}:`, taskResult.error.message);
                        continue;
                    }

                    taskId = (taskResult.data as { id: string }).id;
                    firedTasks++;
                    taskIds.push(taskId);
                } else {
                    throw new Error('Trigger has no agent_id or team_id');
                }

                // Update last_fired_at
                await db
                    .from('agent_triggers')
                    .update({ last_fired_at: new Date().toISOString() })
                    .eq('id', trigger.id);

                // Log success
                await db.from('trigger_log').insert({
                    trigger_id: trigger.id,
                    task_id: taskId,
                    status: 'fired',
                });

                fired++;
                firedTriggerIds.push(trigger.id);
                console.log(`[CronEvaluate] Created ${taskId ? `task ${taskId}` : `team run ${teamRunId}`} from trigger ${trigger.id}`);
            } catch (err) {
                const errMsg = err instanceof Error ? err.message : String(err);
                console.error(`[CronEvaluate] Error processing trigger ${trigger.id}: ${errMsg}`);
            }
        }

        // If work was created, ping the task runner to wake it up
        if (fired > 0) {
            const taskRunnerUrl = Deno.env.get('TASK_RUNNER_URL');
            if (taskRunnerUrl) {
                try {
                    const webhookSecret = Deno.env.get('WEBHOOK_SECRET') ?? '';
                    const headers = {
                        'Content-Type': 'application/json',
                        ...(webhookSecret ? { 'x-webhook-secret': webhookSecret } : {}),
                    };

                    if (firedTasks > 0) {
                        await fetch(`${taskRunnerUrl}/webhook/task`, {
                            method: 'POST',
                            headers,
                            body: JSON.stringify({ source: 'cron-evaluate', fired: firedTasks }),
                            signal: AbortSignal.timeout(10000),
                        });
                    }

                    if (firedTeamRuns > 0) {
                        await fetch(`${taskRunnerUrl}/webhook/team-run`, {
                            method: 'POST',
                            headers,
                            body: JSON.stringify({ source: 'cron-evaluate', fired: firedTeamRuns }),
                            signal: AbortSignal.timeout(10000),
                        });
                    }

                    console.log(`[CronEvaluate] Pinged task runner to pick up ${firedTasks} task(s) and ${firedTeamRuns} team run(s)`);
                } catch {
                    // Non-fatal — work will be picked up on next poll/startup
                    console.warn('[CronEvaluate] Could not reach task runner — work will be picked up on next poll');
                }
            }
        }

        return new Response(JSON.stringify({
            evaluated: rows.length,
            fired,
            fired_tasks: firedTasks,
            fired_team_runs: firedTeamRuns,
            triggered_ids: firedTriggerIds,
            task_ids: taskIds,
            team_run_ids: teamRunIds,
            timestamp: new Date().toISOString(),
        }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[CronEvaluate] Unexpected error:', message);
        return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
