// SPDX-License-Identifier: AGPL-3.0-or-later
import { executionSignal } from './executionScope';
import { executeExternal, type ExternalExecution } from '@crewformhq/agent-runtime';
import { supabase } from './supabase';

/** Trusted self-hosted worker only. Native credentials never leave this machine. */
export async function executeLocalAgent(execution: ExternalExecution, input: {
    workspaceId: string; agentId: string; agentSnapshot: unknown; systemPrompt: string; userPrompt: string; model: string;
    taskId?: string; teamRunId?: string; onStream?: (text: string) => Promise<void> | void;
}) {
    if ((input.agentSnapshot as {config?:{paired_device_id?:unknown}})?.config?.paired_device_id) {
        throw new Error('Paired-device agents require the personal-worker queue. Team and shared-runner execution are not supported.');
    }
    if (process.env.CREWFORM_EXTERNAL_AGENTS_ENABLED !== 'true' ||
        process.env.CREWFORM_EXTERNAL_WORKSPACE_ID !== input.workspaceId ||
        !process.env.CREWFORM_EXTERNAL_CWD || !process.env.CREWFORM_EXTERNAL_USER_ID ||
        (!input.taskId && !input.teamRunId)) {
        throw new Error('Local agents require a trusted runner with CREWFORM_EXTERNAL_AGENTS_ENABLED=true, CREWFORM_EXTERNAL_WORKSPACE_ID, CREWFORM_EXTERNAL_USER_ID and CREWFORM_EXTERNAL_CWD configured. CrewForm Cloud does not use your local login.');
    }
    const controller = new AbortController();
    let checking = false;
    const checkCancelled = async () => {
        if (checking || (!input.taskId && !input.teamRunId)) return;
        checking = true;
        try {
            const { data, error } = await supabase.from(input.taskId ? 'tasks' : 'team_runs')
                .select('status, created_by, actor_type').eq('id', input.taskId ?? input.teamRunId!).eq('workspace_id', input.workspaceId).single();
            if (error || !data || data.actor_type !== 'user' || data.created_by !== process.env.CREWFORM_EXTERNAL_USER_ID || data.status !== 'running') controller.abort();
            if (!controller.signal.aborted) {
                const consent = await supabase.rpc('verify_native_consent', {p_workspace_id:input.workspaceId,p_user_id:process.env.CREWFORM_EXTERNAL_USER_ID,p_task_id:input.taskId??null,p_team_run_id:input.teamRunId??null,p_agent_id:input.agentId,p_agent_snapshot:input.agentSnapshot});
                if (consent.error || consent.data!==true) controller.abort();
            }
        } finally { checking = false; }
    };
    await checkCancelled();
    if (controller.signal.aborted) throw new Error('External execution cancelled or not owned by the configured user.');
    const poll = setInterval(() => { void checkCancelled().catch(() => controller.abort()); }, 1000);
    let text = '';
    let streamWrites = Promise.resolve();
    try {
        const result = await executeExternal(execution, {
            cwd: process.env.CREWFORM_EXTERNAL_CWD,
            prompt: input.userPrompt, systemPrompt: input.systemPrompt, model: input.model,
            signal: executionSignal() ? AbortSignal.any([controller.signal, executionSignal()!]) : controller.signal,
            onChunk: (delta) => {
                text += delta;
                const snapshot = text;
                streamWrites = streamWrites.then(() => input.onStream?.(snapshot)).catch(() => controller.abort());
            },
        });
        await streamWrites;
        await checkCancelled();
        if (controller.signal.aborted) throw new Error('External execution cancelled.');
        return result;
    } finally { clearInterval(poll); }
}
