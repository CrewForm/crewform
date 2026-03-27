import http from 'http';
import { supabase } from './supabase';
import { processTask } from './executor';
import { processPipelineRun } from './pipelineExecutor';
import { processOrchestratorRun } from './orchestratorExecutor';
import { processCollaborationRun } from './collaborationExecutor';
import { writeTeamRunAudit } from './auditWriter';
import { isFeatureEnabled } from './license';
import { handleA2ARequest } from './a2aServer';
import {
    registerRunner, deregisterRunner, getRunnerId, getInstanceName,
    runRecoverySweep, RECOVERY_INTERVAL_MS, MAX_CONCURRENT, decrementLoad,
} from './runnerRegistry';
import { evaluateTriggers, TRIGGER_EVAL_INTERVAL_MS } from './triggerScheduler';
import type { Task, TeamRun } from './types';

// ─── Configuration ───────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? '3001', 10);
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET ?? '';

// ─── Slow-Polling Fallback ───────────────────────────────────────────────────
// Primary pickup is via Realtime subscription; polling is a rare safety net.

const POLL_MIN_MS = 120_000; // 2 min — Realtime handles instant pickup
const POLL_MAX_MS = 300_000; // 5 min max backoff
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

// ─── Shared: Claim & Execute ────────────────────────────────────────────────

/**
 * Attempt to claim and process the next available task.
 * Returns true if work was claimed.
 */
async function tryClaimTask(): Promise<boolean> {
    if (activeSlots >= MAX_CONCURRENT) return false;

    const runnerId = getRunnerId();
    const rpcResponse = await supabase.rpc('claim_next_task', {
        p_runner_id: runnerId,
    });
    const taskData = rpcResponse.data as Task[] | null;
    const taskError = rpcResponse.error;

    if (taskError) {
        logError(`RPC Error claiming task: ${taskError.message}`);
        return false;
    }

    if (taskData && taskData.length > 0) {
        const claimedTask = taskData[0];
        activeSlots++;
        log(`Claimed task ${claimedTask.id} — active: ${activeSlots}/${MAX_CONCURRENT}`);

        processTask(claimedTask)
            .catch((err: unknown) => {
                logError(`Unhandled error processing task ${claimedTask.id}:`, err);
            })
            .finally(() => { onSlotFreed(); });
        return true;
    }

    return false;
}

/**
 * Attempt to claim and process the next available team run.
 * Returns true if work was claimed.
 */
async function tryClaimTeamRun(): Promise<boolean> {
    if (activeSlots >= MAX_CONCURRENT) return false;

    const runnerId = getRunnerId();
    const teamRunResponse = await supabase.rpc('claim_next_team_run', {
        p_runner_id: runnerId,
    });
    const teamRunData = teamRunResponse.data as TeamRun[] | null;
    const teamRunError = teamRunResponse.error;

    if (teamRunError) {
        logError(`RPC Error claiming team run: ${teamRunError.message}`);
        return false;
    }

    if (teamRunData && teamRunData.length > 0) {
        const claimedRun = teamRunData[0];
        activeSlots++;
        log(`Claimed team run ${claimedRun.id} — active: ${activeSlots}/${MAX_CONCURRENT}`);

        executeTeamRun(claimedRun)
            .catch((err: unknown) => {
                logError(`Unhandled error processing team run ${claimedRun.id}:`, err);
                void writeTeamRunAudit(claimedRun.workspace_id, claimedRun.created_by, 'team_run_failed', {
                    team_id: claimedRun.team_id, run_id: claimedRun.id,
                });
            })
            .finally(() => { onSlotFreed(); });
        return true;
    }

    return false;
}

// ─── Poll Loop (Slow Fallback) ───────────────────────────────────────────────

async function poll() {
    if (pollTimer) clearTimeout(pollTimer);

    if (activeSlots >= MAX_CONCURRENT) {
        scheduleNextPoll();
        return;
    }

    let foundWork = false;

    try {
        if (await tryClaimTask()) foundWork = true;
        if (await tryClaimTeamRun()) foundWork = true;
    } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logError(`Unexpected error in polling loop: ${errMsg}`);
    }

    if (foundWork) {
        resetPollInterval();
    } else {
        backOffPollInterval();
    }

    scheduleNextPoll();
}

// ─── Webhook Server ──────────────────────────────────────────────────────────

function createWebhookServer(): http.Server {
    const server = http.createServer((req, res) => {
        // A2A protocol endpoints (Agent Card + JSON-RPC)
        void handleA2ARequest(req, res).then((handled) => {
            if (handled) return;

            // Health check
        if (req.method === 'GET' && req.url === '/health') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                status: 'ok',
                activeSlots,
                maxConcurrent: MAX_CONCURRENT,
                runnerId: getRunnerId(),
            }));
            return;
        }

        // Webhook endpoints
        if (req.method === 'POST' && (req.url === '/webhook/task' || req.url === '/webhook/team-run')) {
            // Validate webhook secret
            if (WEBHOOK_SECRET && req.headers['x-webhook-secret'] !== WEBHOOK_SECRET) {
                log('Webhook rejected — invalid secret');
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Unauthorized' }));
                return;
            }

            // Read body (we don't actually need the payload — we use claim_next RPC)
            let body = '';
            req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
            req.on('end', () => {
                const endpoint = req.url;
                log(`Webhook received: ${endpoint} (${body.length} bytes)`);

                // Respond immediately — processing is async
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ accepted: true }));

                // Attempt to claim and process
                if (endpoint === '/webhook/task') {
                    void tryClaimTask().catch((err: unknown) => {
                        logError('Webhook task claim failed:', err);
                    });
                } else {
                    void tryClaimTeamRun().catch((err: unknown) => {
                        logError('Webhook team-run claim failed:', err);
                    });
                }
            });
            return;
        }

        // 404 for everything else
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
        }); // end handleA2ARequest.then
    });

    return server;
}

// ─── Startup ─────────────────────────────────────────────────────────────────

async function start() {
    try {
        const id = await registerRunner();
        log(`Registered with ID ${id}`);
        log(`MAX_CONCURRENT=${MAX_CONCURRENT}`);
        log(`Webhook server on port ${PORT}`);
        log(`Polling fallback: ${POLL_MIN_MS}ms (min) → ${POLL_MAX_MS}ms (max)`);
        log(`Recovery sweep every ${RECOVERY_INTERVAL_MS}ms`);
        log(`Trigger evaluation every ${TRIGGER_EVAL_INTERVAL_MS}ms`);
        if (!WEBHOOK_SECRET) {
            log('⚠️  WEBHOOK_SECRET is not set — webhook endpoints are unprotected');
        }

        // Start HTTP webhook server
        const server = createWebhookServer();
        server.listen(PORT, '0.0.0.0', () => {
            log(`Webhook server listening on 0.0.0.0:${PORT}`);
        });

        // ── Realtime Subscriptions with Auto-Reconnect ──────────────────────
        // Subscribe to tasks and team_runs for near-instant pickup.
        // Railway (and other PaaS) may drop idle WebSocket connections,
        // so we monitor channel health and reconnect automatically.
        // If Realtime permanently fails, we give up and rely on polling + webhooks.

        const REALTIME_HEALTH_CHECK_MS = 60_000; // Check every 60s
        let realtimeReconnectAttempt = 0;
        let isReconnecting = false;
        let realtimeDisabled = false; // Set true after max attempts — stops all reconnect attempts
        const REALTIME_MAX_RECONNECT_DELAY_MS = 30_000;
        const REALTIME_MAX_ATTEMPTS_BEFORE_RESET = 15; // Cap exponent growth
        const REALTIME_GIVE_UP_AFTER = 5; // Stop retrying after N consecutive failures

        function createRealtimeChannel() {
            const ch = supabase
                .channel('runner-dispatch')
                .on(
                    'postgres_changes',
                    {
                        event: 'UPDATE',
                        schema: 'public',
                        table: 'tasks',
                        filter: 'status=eq.dispatched',
                    },
                    (payload) => {
                        log(`Realtime: task ${(payload.new as { id: string }).id} dispatched — claiming`);
                        void tryClaimTask().catch((err: unknown) => {
                            logError('Realtime task claim failed:', err);
                        });
                    },
                )
                .on(
                    'postgres_changes',
                    {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'tasks',
                        filter: 'status=eq.dispatched',
                    },
                    (payload) => {
                        log(`Realtime: new task ${(payload.new as { id: string }).id} — claiming`);
                        void tryClaimTask().catch((err: unknown) => {
                            logError('Realtime task claim failed:', err);
                        });
                    },
                )
                .on(
                    'postgres_changes',
                    {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'team_runs',
                        filter: 'status=eq.pending',
                    },
                    (payload) => {
                        log(`Realtime: new team run ${(payload.new as { id: string }).id} — claiming`);
                        void tryClaimTeamRun().catch((err: unknown) => {
                            logError('Realtime team-run claim failed:', err);
                        });
                    },
                )
                .subscribe((status) => {
                    if (realtimeDisabled) return;
                    log(`Realtime channel status: ${status}`);

                    if (status === 'SUBSCRIBED') {
                        realtimeReconnectAttempt = 0;
                        isReconnecting = false;
                        // Catch any work missed while disconnected
                        void poll();
                    } else if (status === 'CHANNEL_ERROR' || status === 'CLOSED' || status === 'TIMED_OUT') {
                        if (!isReconnecting) {
                            void reconnectRealtime();
                        }
                    }
                });

            return ch;
        }

        async function reconnectRealtime() {
            if (isReconnecting || realtimeDisabled) return;
            isReconnecting = true;

            realtimeReconnectAttempt++;

            // Give up after N consecutive failures — WebSocket likely blocked
            if (realtimeReconnectAttempt > REALTIME_GIVE_UP_AFTER) {
                realtimeDisabled = true;
                isReconnecting = false;
                log(`⚠️  Realtime failed after ${REALTIME_GIVE_UP_AFTER} attempts — disabling. Task pickup via polling (${POLL_MIN_MS / 1000}s) and webhooks.`);
                try { await supabase.removeAllChannels(); } catch { /* best-effort */ }
                (globalThis as Record<string, unknown>).__realtimeChannel = undefined;
                // Tighten polling interval since Realtime is down
                pollIntervalMs = POLL_MIN_MS;
                return;
            }

            const effectiveAttempt = Math.min(realtimeReconnectAttempt, REALTIME_MAX_ATTEMPTS_BEFORE_RESET);
            const delay = Math.min(
                1000 * Math.pow(2, effectiveAttempt - 1),
                REALTIME_MAX_RECONNECT_DELAY_MS,
            );
            log(`Realtime reconnect attempt ${realtimeReconnectAttempt}/${REALTIME_GIVE_UP_AFTER} in ${delay}ms`);
            await new Promise(resolve => setTimeout(resolve, delay));

            // Remove ALL channels — ensures no leaked subscriptions
            try {
                await supabase.removeAllChannels();
            } catch {
                // Best-effort cleanup
            }

            // Create fresh channel
            const newChannel = createRealtimeChannel();
            (globalThis as Record<string, unknown>).__realtimeChannel = newChannel;

            // If subscription callback doesn't fire within 15s, allow another attempt
            setTimeout(() => {
                if (isReconnecting) {
                    isReconnecting = false;
                }
            }, 15_000);
        }

        // Health check: detect silent disconnects
        setInterval(() => {
            if (isReconnecting || realtimeDisabled) return;

            const ch = (globalThis as Record<string, unknown>).__realtimeChannel as
                ReturnType<typeof supabase.channel> | undefined;
            if (!ch) return;

            const state = (ch as unknown as { state: string }).state;
            if (state && state !== 'joined' && state !== 'joining') {
                log(`Realtime health check: channel state "${state}" — triggering reconnect`);
                void reconnectRealtime();
            }
        }, REALTIME_HEALTH_CHECK_MS);

        const channel = createRealtimeChannel();
        (globalThis as Record<string, unknown>).__realtimeChannel = channel;

        // Start recovery sweep and trigger evaluation on fixed intervals
        setInterval(() => { void runRecoverySweep(); }, RECOVERY_INTERVAL_MS);
        setInterval(() => { void evaluateTriggers(); }, TRIGGER_EVAL_INTERVAL_MS);

        // Initial poll (slow fallback chain starts here)
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
    // Unsubscribe from Realtime
    const channel = (globalThis as Record<string, unknown>).__realtimeChannel;
    if (channel) {
        await supabase.removeChannel(channel as ReturnType<typeof supabase.channel>);
        log('Realtime channel unsubscribed');
    }
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
