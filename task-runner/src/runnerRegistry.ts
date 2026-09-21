import os from 'os';
import { supabase } from './supabase';

let runnerId: string | null = null;
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
let lastHeartbeatAt = 0;
let heartbeatInFlight = false;
let recoveryInFlight = false;
let leaseLost = false;
let onLeaseLost: () => void = () => { process.exit(1); };

const HEARTBEAT_INTERVAL_MS = 10_000;
export const RECOVERY_INTERVAL_MS = 30_000;
const INSTANCE_NAME = `${os.hostname()}-${process.pid}`;

/** Max concurrent tasks this runner can handle. */
const configuredConcurrency = Number(process.env.MAX_CONCURRENT ?? '3');
export const MAX_CONCURRENT = Number.isInteger(configuredConcurrency) && configuredConcurrency > 0
    ? configuredConcurrency : 3;

/**
 * Register this task runner instance in the database.
 * Returns the assigned runner UUID.
 */
export async function registerRunner(handleLeaseLost?: () => void): Promise<string> {
    const { data, error } = await supabase
        .from('task_runners')
        .insert({
            instance_name: INSTANCE_NAME,
            status: 'active',
            max_concurrency: MAX_CONCURRENT,
            current_load: 0,
        })
        .select('id')
        .single();

    if (error || !data) {
        throw new Error(`Failed to register runner: ${error?.message ?? 'no data returned'}`);
    }

    runnerId = data.id as string;
    lastHeartbeatAt = Date.now();
    leaseLost = false;
    if (handleLeaseLost) onLeaseLost = handleLeaseLost;

    // Start heartbeat loop
    heartbeatInterval = setInterval(() => {
        void sendHeartbeat().catch((err: unknown) => {
            console.error(`[Runner ${INSTANCE_NAME}] Heartbeat failed:`, err);
        });
    }, HEARTBEAT_INTERVAL_MS);

    return runnerId;
}

/**
 * Send a heartbeat to update last_heartbeat timestamp.
 */
export async function sendHeartbeat(): Promise<void> {
    if (!runnerId || heartbeatInFlight || leaseLost) return;
    heartbeatInFlight = true;
    try {
        const { data, error } = await supabase
            .from('task_runners')
            .update({ last_heartbeat: new Date().toISOString() })
            .eq('id', runnerId)
            .eq('status', 'active')
            .select('id')
            .maybeSingle();

        if (error) {
            console.error(`[Runner ${INSTANCE_NAME}] Heartbeat failed:`, error.message);
            return;
        }
        if (!data) {
            // An UPDATE of a deleted row is a successful request with zero rows.
            // Never revive this lease: recovery may already have reassigned its work.
            leaseLost = true;
            console.error(`[Runner ${INSTANCE_NAME}] Runner registration lost; exiting for a clean restart.`);
            onLeaseLost();
            return;
        }
        lastHeartbeatAt = Date.now();
    } finally {
        heartbeatInFlight = false;
    }
}

/** Readiness, rather than merely whether the Node process is alive. */
export function isRunnerHealthy(): boolean {
    return !!runnerId && !leaseLost && Date.now() - lastHeartbeatAt < 60_000;
}

/**
 * Decrement runner load in the database after a task/run completes.
 */
export async function decrementLoad(): Promise<void> {
    if (!runnerId) return;

    const { error } = await supabase.rpc('decrement_runner_load', {
        p_runner_id: runnerId,
    });

    if (error) {
        console.error(`[Runner ${INSTANCE_NAME}] decrement_runner_load failed:`, error.message);
    }
}

/**
 * Run a recovery sweep: mark stale runners as dead, then recover their orphaned tasks.
 * Returns the number of recovered tasks/runs.
 */
export async function runRecoverySweep(): Promise<number> {
    if (recoveryInFlight) return 0;
    recoveryInFlight = true;
    try {
        // 1. Mark stale runners as dead
        const markResult = await supabase.rpc('mark_stale_runners', { stale_threshold: '2 minutes' });
        const staleCount = (markResult.data as number | null) ?? 0;

        if (markResult.error) {
            console.error(`[Runner ${INSTANCE_NAME}] mark_stale_runners failed:`, markResult.error.message);
            return 0;
        }

        if (staleCount > 0) {
            console.warn(`[Runner ${INSTANCE_NAME}] Marked ${staleCount} stale runner(s) as dead.`);
        }

        // Always recover: a previous sweep may have marked runners dead and
        // then failed, or a shutdown may have marked one dead explicitly.
        const recoverResult = await supabase.rpc('recover_stale_tasks');
        const recoveredCount = (recoverResult.data as number | null) ?? 0;

        if (recoverResult.error) {
            console.error(`[Runner ${INSTANCE_NAME}] recover_stale_tasks failed:`, recoverResult.error.message);
            return 0;
        }

        if (recoveredCount > 0) {
            console.warn(`[Runner ${INSTANCE_NAME}] Recovered ${recoveredCount} orphaned task(s)/run(s).`);
        }

        return recoveredCount;
    } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`[Runner ${INSTANCE_NAME}] Recovery sweep error: ${errMsg}`);
        return 0;
    } finally {
        recoveryInFlight = false;
    }
}

/**
 * Retire this runner without losing ownership of unfinished work.
 */
export async function deregisterRunner(): Promise<void> {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }

    if (!runnerId) return;

    const { error } = await supabase
        .from('task_runners')
        .update({ status: 'dead' })
        .eq('id', runnerId);

    if (error) {
        console.error(`[Runner ${INSTANCE_NAME}] Deregister failed:`, error.message);
    } else {
        console.log(`[Runner ${INSTANCE_NAME}] Deregistered successfully.`);
    }

    runnerId = null;
    lastHeartbeatAt = 0;
}

/**
 * Get the current runner ID. Returns null if not registered.
 */
export function getRunnerId(): string | null {
    return runnerId;
}

/**
 * Get the human-readable instance name.
 */
export function getInstanceName(): string {
    return INSTANCE_NAME;
}
