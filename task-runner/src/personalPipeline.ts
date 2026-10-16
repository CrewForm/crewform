// SPDX-License-Identifier: MIT
import {setTimeout as delay} from 'node:timers/promises';
import {supabase} from './supabase';
import {executionSignal} from './executionScope';
import {executionIdentity} from './executionIdentity';
import type {Agent,PipelineStep,TokenUsage} from './types';
import {parseExecution} from '@crewformhq/agent-runtime';

export function validatePersonalPipelineSteps(steps: PipelineStep[], agents: Record<string,Agent>): void {
    for (const step of steps) {
        const ids=step.type==='fan_out' ? [...step.parallel_agents??[],step.merge_agent_id??''] : [step.agent_id];
        for (const id of ids) {
            const agent=agents[id];
            if (!agent?.config.paired_device_id) continue;
            if (step.type==='fan_out') throw new Error('Paired personal devices support sequential pipeline steps. Fan-out device jobs are not supported.');
            if (typeof agent.config.paired_device_id!=='string' || !/^[a-f0-9-]{36}$/i.test(agent.config.paired_device_id) || !parseExecution(agent.config) || agent.tools?.length || agent.fallback_model)
                throw new Error('Personal pipeline steps require a paired native agent without CrewForm tools.');
        }
    }
}

/** Native credentials remain on the selected device. The runner only queues
 * approved supplied context and waits for an attempt-bound result. */
export async function executePersonalPipelineStep(input: {
    runId:string;stepIndex:number;agentId:string;systemPrompt:string;userPrompt:string;
}):Promise<{result:string;usage:TokenUsage}> {
    const attempt=executionIdentity.getStore()?.attemptId;
    if (!attempt) throw new Error('Pipeline attempt is required for personal dispatch.');
    const scope={p_run:input.runId,p_attempt:attempt};
    let completed=false;
    try {
        executionSignal()?.throwIfAborted();
        const queued=await supabase.rpc('queue_personal_pipeline_job',{...scope,p_step:input.stepIndex,p_agent:input.agentId,p_prompt:input.userPrompt,p_system_prompt:input.systemPrompt});
        if (queued.error) throw new Error(queued.error.message);
        if (typeof queued.data!=='string') throw new Error('Personal pipeline queue returned no job.');
        const jobId=queued.data;
        await supabase.from('team_messages').insert({run_id:input.runId,sender_agent_id:null,receiver_agent_id:input.agentId,
            message_type:'system',content:'Waiting for the approved personal device. No API fallback will be attempted.',
            metadata:{personal_job_id:jobId,step_index:input.stepIndex},step_idx:input.stepIndex,tokens_used:0});
        for (;;) {
            executionSignal()?.throwIfAborted();
            const response=await supabase.rpc('read_personal_pipeline_job',{...scope,p_job:jobId});
            if (response.error) throw new Error(response.error.message);
            const state=response.data as {status:string;result:string|null;error:string|null};
            if (state.status==='completed') {
                if (typeof state.result!=='string') throw new Error('Personal device returned no result.');
                completed=true;
                return {result:state.result,usage:{promptTokens:0,completionTokens:0,totalTokens:0,costEstimateUSD:0,usageKnown:false,billingModel:'unknown'}};
            }
            if (!['queued','running'].includes(state.status)) throw new Error(state.error??'Personal device execution interrupted; review possible effects before a new run.');
            await delay(750,undefined,{signal:executionSignal()});
        }
    } finally {
        if (!completed) {
            // Also handles a lost queue acknowledgement. SQL locates the unique
            // job by parent attempt + step and clears only a never-issued lease.
            try {
                const cancelled=await supabase.rpc('cancel_personal_pipeline_job',{...scope,p_step:input.stepIndex});
                if (cancelled.error) throw cancelled.error;
            } catch {console.warn('[PersonalPipeline] Cleanup unavailable; the lease/authority checks remain active.');}
        }
    }
}
