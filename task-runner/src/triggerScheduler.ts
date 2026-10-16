/**
 * Trigger Scheduler — evaluates CRON triggers and creates tasks automatically.
 *
 * Runs every 60s inside the task runner. Queries all enabled CRON triggers,
 * checks if they're due based on last_fired_at, creates tasks, and logs firings.
 */

import { supabase } from './supabase';

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

import {isTriggerDue} from './cron';
export {cronMatchesDate,isTriggerDue} from './cron';

import {renderScheduleTemplate as renderTemplate,buildScheduleContext} from './scheduleContext';

// ─── Main Scheduler ─────────────────────────────────────────────────────────

let isEvaluating = false;

export async function evaluateTriggers(): Promise<void> {
    if (isEvaluating) return;
    isEvaluating = true;

    try {
        // Fetch all enabled CRON triggers
        const result = await supabase
            .from('agent_triggers')
            .select('id, agent_id, team_id, workspace_id, cron_expression, task_title_template, task_description_template, context_options, last_fired_at, created_at')
            .eq('trigger_type', 'cron')
            .eq('enabled', true)
            .not('cron_expression', 'is', null);

        const triggers = result.data as CronTriggerRow[] | null;
        if (result.error) {
            console.error('[TriggerScheduler] Error fetching triggers:', result.error.message);
            return;
        }
        if (!triggers || triggers.length === 0) return;

        for (const trigger of triggers) {
            try {
                if (!isTriggerDue(trigger.cron_expression, trigger.last_fired_at, trigger.created_at)) continue;

                const target = trigger.team_id ? `team ${trigger.team_id}` : `agent ${trigger.agent_id}`;
                console.log(`[TriggerScheduler] Firing trigger ${trigger.id} for ${target}`);

                const title = renderTemplate(trigger.task_title_template);
                let description = renderTemplate(trigger.task_description_template);

                description += await buildScheduleContext(trigger.context_options ?? [], async (table,columns,start,end) => {
                    const result = await supabase.from(table).select(columns).eq('workspace_id',trigger.workspace_id)
                        .gte('created_at',start).lt('created_at',end).order('created_at',{ascending:false}).limit(1001);
                    if (result.error) throw new Error('Requested schedule context is unavailable; firing deferred.');
                    return (result.data ?? []) as unknown as Record<string,unknown>[];
                });

                const enqueue = await supabase.rpc('enqueue_scheduled_firing', {
                    p_trigger_id: trigger.id, p_observed_last_fired: trigger.last_fired_at,
                    p_title: title, p_description: description,
                });
                if (enqueue.error) throw new Error(enqueue.error.message);
                const firing = (enqueue.data as Array<{task_id: string | null; team_run_id: string | null}> | null)?.[0];
                if (!firing) continue;
                const taskId = firing.task_id;
                const teamRunId = firing.team_run_id;
                console.log(`[TriggerScheduler] Created ${taskId ? `task ${taskId}` : `team run ${teamRunId}`} from trigger ${trigger.id}`);
            } catch (err: unknown) {
                const errMsg = err instanceof Error ? err.message : String(err);
                console.error(`[TriggerScheduler] Error processing trigger ${trigger.id}: ${errMsg}`);
            }
        }
    } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`[TriggerScheduler] Unexpected error: ${errMsg}`);
    } finally {
        isEvaluating = false;
    }
}

export const TRIGGER_EVAL_INTERVAL_MS = 60_000; // 60 seconds
