// SPDX-License-Identifier: MIT
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

import {isTriggerDue} from '../_shared/cron.ts';

import {renderScheduleTemplate as renderTemplate,buildScheduleContext} from '../_shared/scheduleContext.ts';

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
                let description = renderTemplate(trigger.task_description_template);
                description += await buildScheduleContext(trigger.context_options ?? [], async (table,columns,start,end) => {
                    const result = await db.from(table).select(columns).eq('workspace_id',trigger.workspace_id)
                        .gte('created_at',start).lt('created_at',end).order('created_at',{ascending:false}).limit(1001);
                    if (result.error) throw new Error('Requested schedule context is unavailable; firing deferred.');
                    return (result.data ?? []) as unknown as Record<string,unknown>[];
                });

                const enqueue = await db.rpc('enqueue_scheduled_firing', {
                    p_trigger_id: trigger.id, p_observed_last_fired: trigger.last_fired_at,
                    p_title: title, p_description: description,
                });
                if (enqueue.error) throw new Error(enqueue.error.message);
                const firing = (enqueue.data as Array<{task_id: string | null; team_run_id: string | null}> | null)?.[0];
                if (!firing) continue;
                const taskId = firing.task_id;
                const teamRunId = firing.team_run_id;
                if (taskId) { firedTasks++; taskIds.push(taskId); }
                if (teamRunId) { firedTeamRuns++; teamRunIds.push(teamRunId); }
                fired++; firedTriggerIds.push(trigger.id);
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
                        const response = await fetch(`${taskRunnerUrl}/webhook/task`, {
                            method: 'POST',
                            headers,
                            body: JSON.stringify({ source: 'cron-evaluate', fired: firedTasks }),
                            signal: AbortSignal.timeout(10000),
                        });
                        if (!response.ok) throw new Error(`Task runner returned HTTP ${response.status}`);
                    }

                    if (firedTeamRuns > 0) {
                        const response = await fetch(`${taskRunnerUrl}/webhook/team-run`, {
                            method: 'POST',
                            headers,
                            body: JSON.stringify({ source: 'cron-evaluate', fired: firedTeamRuns }),
                            signal: AbortSignal.timeout(10000),
                        });
                        if (!response.ok) throw new Error(`Task runner returned HTTP ${response.status}`);
                    }

                    console.log(`[CronEvaluate] Pinged task runner to pick up ${firedTasks} task(s) and ${firedTeamRuns} team run(s)`);
                } catch (error) {
                    // Non-fatal — work will be picked up on next poll/startup
                    console.warn('[CronEvaluate] Runner wake-up failed; work remains queued:', error instanceof Error ? error.message : 'unknown error');
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
