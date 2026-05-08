// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

/**
 * Cron Evaluate — serverless cron trigger evaluation.
 *
 * Called by Supabase pg_cron on a schedule (e.g. every 30 min or hourly).
 * Evaluates all enabled CRON triggers, creates pending tasks for any that
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
    agent_id: string;
    workspace_id: string;
    cron_expression: string;
    task_title_template: string;
    task_description_template: string;
    context_options: string[];
    last_fired_at: string | null;
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

function isTriggerDue(cronExpression: string, lastFiredAt: string | null): boolean {
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

    // Catch-up: check for missed firings
    if (!lastFiredAt) return false;

    const lastFired = new Date(lastFiredAt);
    const gapMs = now.getTime() - lastFired.getTime();

    if (gapMs < 2 * 60 * 1000) return false;

    const lookbackStart = new Date(Math.max(lastFired.getTime(), now.getTime() - MAX_CATCHUP_MS));
    const scanTime = new Date(lookbackStart);
    scanTime.setSeconds(0, 0);
    scanTime.setMinutes(scanTime.getMinutes() + 1);

    while (scanTime < now) {
        if (cronMatchesDate(cronExpression, scanTime)) {
            console.log(
                `[CronEvaluate] Catch-up: missed firing at ${scanTime.toISOString()} ` +
                `(last fired: ${lastFiredAt}, now: ${now.toISOString()})`,
            );
            return true;
        }
        scanTime.setMinutes(scanTime.getMinutes() + 1);
    }

    return false;
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

    // Auth: accept CRON_SECRET header, service_role key, or Authorization Bearer
    const cronSecret = Deno.env.get('CRON_SECRET');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const incomingSecret = req.headers.get('x-cron-secret');
    const authHeader = req.headers.get('Authorization');
    const apiKey = req.headers.get('apikey');

    const isAuthorized =
        (cronSecret && incomingSecret === cronSecret) ||
        (authHeader === `Bearer ${serviceRoleKey}`) ||
        (apiKey === serviceRoleKey);

    if (!isAuthorized) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const db = createClient(supabaseUrl, serviceRoleKey);

        // Fetch all enabled CRON triggers
        const { data: triggers, error: fetchError } = await db
            .from('agent_triggers')
            .select('id, agent_id, workspace_id, cron_expression, task_title_template, task_description_template, context_options, last_fired_at')
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
        const firedTriggerIds: string[] = [];

        for (const trigger of rows) {
            try {
                if (!isTriggerDue(trigger.cron_expression, trigger.last_fired_at)) continue;

                console.log(`[CronEvaluate] Firing trigger ${trigger.id} for agent ${trigger.agent_id}`);

                const title = renderTemplate(trigger.task_title_template);
                const description = renderTemplate(trigger.task_description_template);

                // Create the task as pending
                const taskResult = await db
                    .from('tasks')
                    .insert({
                        workspace_id: trigger.workspace_id,
                        title,
                        description,
                        assigned_agent_id: trigger.agent_id,
                        status: 'pending',
                        priority: 'medium',
                        created_by: trigger.agent_id,
                        scheduled_for: new Date().toISOString(),
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

                const taskId = (taskResult.data as { id: string }).id;

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
                console.log(`[CronEvaluate] Created task ${taskId} from trigger ${trigger.id}`);
            } catch (err) {
                const errMsg = err instanceof Error ? err.message : String(err);
                console.error(`[CronEvaluate] Error processing trigger ${trigger.id}: ${errMsg}`);
            }
        }

        // If tasks were created, ping the task runner to wake it up
        if (fired > 0) {
            const taskRunnerUrl = Deno.env.get('TASK_RUNNER_URL');
            if (taskRunnerUrl) {
                try {
                    const webhookSecret = Deno.env.get('WEBHOOK_SECRET') ?? '';
                    await fetch(`${taskRunnerUrl}/webhook/task`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            ...(webhookSecret ? { 'x-webhook-secret': webhookSecret } : {}),
                        },
                        body: JSON.stringify({ source: 'cron-evaluate', fired }),
                        signal: AbortSignal.timeout(10000),
                    });
                    console.log(`[CronEvaluate] Pinged task runner to pick up ${fired} task(s)`);
                } catch {
                    // Non-fatal — tasks will be picked up on next poll/startup
                    console.warn('[CronEvaluate] Could not reach task runner — tasks will be picked up on next poll');
                }
            }
        }

        return new Response(JSON.stringify({
            evaluated: rows.length,
            fired,
            triggered_ids: firedTriggerIds,
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
