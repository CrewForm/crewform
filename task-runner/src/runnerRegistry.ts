import os from 'os';
import { supabase } from './supabase';

let runnerId: string | null = null;
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

const HEARTBEAT_INTERVAL_MS = 10_000;
export const RECOVERY_INTERVAL_MS = 30_000;
const INSTANCE_NAME = `${os.hostname()}-${process.pid}`;

/** Max concurrent tasks this runner can handle. */
export const MAX_CONCURRENT = Math.max(1, parseInt(process.env.MAX_CONCURRENT ?? '3', 10));

/**
 * Register this task runner instance in the database.
 * Returns the assigned runner UUID.
 */
export async function registerRunner(): Promise<string> {
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

    // Start heartbeat loop
    heartbeatInterval = setInterval(() => {
        void sendHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);

    return runnerId;
}

/**
 * Send a heartbeat to update last_heartbeat timestamp.
 */
async function sendHeartbeat(): Promise<void> {
    if (!runnerId) return;

    const { error } = await supabase
        .from('task_runners')
        .update({ last_heartbeat: new Date().toISOString() })
        .eq('id', runnerId);

    if (error) {
        console.error(`[Runner ${INSTANCE_NAME}] Heartbeat failed:`, error.message);
    }
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
    try {
        // 1. Mark stale runners as dead
        const markResult = await supabase.rpc('mark_stale_runners');
        const staleCount = (markResult.data as number | null) ?? 0;

        if (markResult.error) {
            console.error(`[Runner ${INSTANCE_NAME}] mark_stale_runners failed:`, markResult.error.message);
            return 0;
        }

        if (staleCount > 0) {
            console.warn(`[Runner ${INSTANCE_NAME}] Marked ${staleCount} stale runner(s) as dead.`);

            // 2. Recover orphaned tasks from dead runners
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
        }

        return 0;
    } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`[Runner ${INSTANCE_NAME}] Recovery sweep error: ${errMsg}`);
        return 0;
    }
}

/**
 * Deregister this runner (delete its row) on graceful shutdown.
 */
export async function deregisterRunner(): Promise<void> {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }

    if (!runnerId) return;

    const { error } = await supabase
        .from('task_runners')
        .delete()
        .eq('id', runnerId);

    if (error) {
        console.error(`[Runner ${INSTANCE_NAME}] Deregister failed:`, error.message);
    } else {
        console.log(`[Runner ${INSTANCE_NAME}] Deregistered successfully.`);
    }

    runnerId = null;
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
