import { supabase } from './supabase';
import { processTask } from './executor';
import { processPipelineRun } from './pipelineExecutor';
import { processOrchestratorRun } from './orchestratorExecutor';
import { processCollaborationRun } from './collaborationExecutor';
import { writeTeamRunAudit } from './auditWriter';
import { isFeatureEnabled } from './license';
import {
    registerRunner, deregisterRunner, getRunnerId, getInstanceName,
    runRecoverySweep, RECOVERY_INTERVAL_MS, MAX_CONCURRENT, decrementLoad,
} from './runnerRegistry';
import { evaluateTriggers, TRIGGER_EVAL_INTERVAL_MS } from './triggerScheduler';
import type { Task, TeamRun } from './types';

// ─── Adaptive Polling ────────────────────────────────────────────────────────

const POLL_MIN_MS = 1_000;
const POLL_MAX_MS = 15_000;
let pollIntervalMs = POLL_MIN_MS;
let pollTimer: ReturnType<typeof setTimeout> | null = null;

/** Active slots — how many tasks/runs are currently being processed. */
let activeSlots = 0;

function log(msg: string) {
    const name = getInstanceName();
    console.log(`[Runner ${name}] ${msg}`);
}

function logError(msg: string, err?: unknown) {
    const name = getInstanceName();
    if (err) {
        console.error(`[Runner ${name}] ${msg}`, err);
    } else {
        console.error(`[Runner ${name}] ${msg}`);
    }
}

/** Schedule the next poll with the current adaptive interval. */
function scheduleNextPoll() {
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = setTimeout(() => { void poll(); }, pollIntervalMs);
}

/** Reset poll interval to minimum (work found). */
function resetPollInterval() {
    pollIntervalMs = POLL_MIN_MS;
}

/** Back off the poll interval (no work found). */
function backOffPollInterval() {
    pollIntervalMs = Math.min(pollIntervalMs * 2, POLL_MAX_MS);
}

/**
 * Called when a task/run finishes (success or failure).
 * Decrements the active slot count, updates DB load, and triggers a new poll.
 */
function onSlotFreed() {
    activeSlots = Math.max(activeSlots - 1, 0);
    log(`Slot freed — active: ${activeSlots}/${MAX_CONCURRENT}`);
    void decrementLoad();
    // Immediately try to fill the freed slot
    resetPollInterval();
    scheduleNextPoll();
}

// ─── Team Run Executor Router ────────────────────────────────────────────────

async function executeTeamRun(run: TeamRun): Promise<void> {
    // Audit: team run started
    void writeTeamRunAudit(run.workspace_id, run.created_by, 'team_run_started', {
        team_id: run.team_id, run_id: run.id,
    });

    // Determine team mode
    const teamResponse = await supabase
        .from('teams')
        .select('mode')
        .eq('id', run.team_id)
        .single();

    const teamMode = (teamResponse.data as { mode: string } | null)?.mode ?? 'pipeline';

    // Gate EE modes behind license check
    if (teamMode === 'orchestrator') {
        const allowed = await isFeatureEnabled(run.workspace_id, 'orchestrator_mode');
        if (!allowed) {
            log(`Orchestrator mode requires an Enterprise license — failing run ${run.id}`);
            await supabase.from('team_runs').update({
                status: 'failed',
                output: 'Orchestrator mode requires a Pro plan or above. Please upgrade at crewform.tech/pricing.',
            }).eq('id', run.id);
            return;
        }
        await processOrchestratorRun(run);
    } else if (teamMode === 'collaboration') {
        const allowed = await isFeatureEnabled(run.workspace_id, 'collaboration_mode');
        if (!allowed) {
            log(`Collaboration mode requires an Enterprise license — failing run ${run.id}`);
            await supabase.from('team_runs').update({
                status: 'failed',
                output: 'Collaboration mode requires a Team plan or above. Please upgrade at crewform.tech/pricing.',
            }).eq('id', run.id);
            return;
        }
        await processCollaborationRun(run);
    } else {
        await processPipelineRun(run);
    }

    void writeTeamRunAudit(run.workspace_id, run.created_by, 'team_run_completed', {
        team_id: run.team_id, run_id: run.id,
    });
}

// ─── Poll Loop ───────────────────────────────────────────────────────────────

async function poll() {
    if (pollTimer) clearTimeout(pollTimer);

    // Don't claim if already at capacity
    if (activeSlots >= MAX_CONCURRENT) {
        scheduleNextPoll();
        return;
    }

    const runnerId = getRunnerId();
    let foundWork = false;

    try {
        // ─── 1. Check for pending tasks ──────────────────────────────────
        const rpcResponse = await supabase.rpc('claim_next_task', {
            p_runner_id: runnerId,
        });
        const taskData = rpcResponse.data as Task[] | null;
        const taskError = rpcResponse.error;

        if (taskError) {
            logError(`RPC Error claiming task: ${taskError.message}`);
        } else if (taskData && taskData.length > 0) {
            const claimedTask = taskData[0];
            activeSlots++;
            foundWork = true;
            log(`Claimed task ${claimedTask.id} — active: ${activeSlots}/${MAX_CONCURRENT}`);

            processTask(claimedTask)
                .catch((err: unknown) => {
                    logError(`Unhandled error processing task ${claimedTask.id}:`, err);
                })
                .finally(() => { onSlotFreed(); });
        }

        // ─── 2. Check for pending team runs (if still have capacity) ─────
        if (activeSlots < MAX_CONCURRENT) {
            const teamRunResponse = await supabase.rpc('claim_next_team_run', {
                p_runner_id: runnerId,
            });
            const teamRunData = teamRunResponse.data as TeamRun[] | null;
            const teamRunError = teamRunResponse.error;

            if (teamRunError) {
                logError(`RPC Error claiming team run: ${teamRunError.message}`);
            } else if (teamRunData && teamRunData.length > 0) {
                const claimedRun = teamRunData[0];
                activeSlots++;
                foundWork = true;
                log(`Claimed team run ${claimedRun.id} — active: ${activeSlots}/${MAX_CONCURRENT}`);

                executeTeamRun(claimedRun)
                    .catch((err: unknown) => {
                        logError(`Unhandled error processing team run ${claimedRun.id}:`, err);
                        void writeTeamRunAudit(claimedRun.workspace_id, claimedRun.created_by, 'team_run_failed', {
                            team_id: claimedRun.team_id, run_id: claimedRun.id,
                        });
                    })
                    .finally(() => { onSlotFreed(); });
            }
        }
    } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logError(`Unexpected error in polling loop: ${errMsg}`);
    }

    // Adjust polling speed
    if (foundWork) {
        resetPollInterval();
    } else {
        backOffPollInterval();
    }

    scheduleNextPoll();
}

// ─── Startup ─────────────────────────────────────────────────────────────────

async function start() {
    try {
        const id = await registerRunner();
        log(`Registered with ID ${id}`);
        log(`MAX_CONCURRENT=${MAX_CONCURRENT}`);
        log(`Poll interval: ${POLL_MIN_MS}ms (min) → ${POLL_MAX_MS}ms (max, adaptive)`);
        log(`Recovery sweep every ${RECOVERY_INTERVAL_MS}ms for stale runners.`);
        log(`Trigger evaluation every ${TRIGGER_EVAL_INTERVAL_MS}ms.`);

        // Start recovery sweep and trigger evaluation on fixed intervals
        setInterval(() => { void runRecoverySweep(); }, RECOVERY_INTERVAL_MS);
        setInterval(() => { void evaluateTriggers(); }, TRIGGER_EVAL_INTERVAL_MS);

        // Initial poll (adaptive setTimeout chain starts here)
        void poll();
    } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`[TaskRunner] Failed to start: ${errMsg}`);
        process.exit(1);
    }
}

// ─── Graceful Shutdown ───────────────────────────────────────────────────────

async function shutdown(signal: string) {
    log(`Received ${signal}, shutting down gracefully...`);
    if (pollTimer) clearTimeout(pollTimer);
    // Wait briefly for in-flight tasks to complete (best effort)
    if (activeSlots > 0) {
        log(`Waiting for ${activeSlots} active task(s) to finish...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
    await deregisterRunner();
    process.exit(0);
}

process.on('SIGINT', () => { void shutdown('SIGINT'); });
process.on('SIGTERM', () => { void shutdown('SIGTERM'); });

// Start
void start();
