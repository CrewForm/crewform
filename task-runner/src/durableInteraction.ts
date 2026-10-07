// SPDX-License-Identifier: AGPL-3.0-or-later
import {supabase} from './supabase';
import type {InteractionResponse} from './types';
/** Persisted responses can be received by any runner; the event bus is only UI transport. */
export async function waitForDurableResponse(taskId: string, interactionId: string, timeoutMs: number, consumedSteps = new Set<string>()): Promise<InteractionResponse> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const task = await supabase.from('tasks').select('status, interaction_context').eq('id',taskId).single();
        if (task.error || task.data?.status !== 'waiting_for_input' || task.data.interaction_context?.interactionId !== interactionId) throw new Error('Interaction cancelled or superseded');
        const saved = await supabase.from('interaction_responses').select('step_id, response').eq('task_id',taskId).eq('interaction_id',interactionId).order('created_at',{ascending:true});
        if (saved.error) throw new Error(saved.error.message);
        const next = saved.data?.find(row => !consumedSteps.has(row.step_id));
        if (next) { consumedSteps.add(next.step_id); return next.response as InteractionResponse; }
        await new Promise(resolve => setTimeout(resolve, Math.min(500,deadline-Date.now())));
    }
    throw new Error('Interaction timed out');
}
