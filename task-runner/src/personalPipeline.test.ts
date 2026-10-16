// SPDX-License-Identifier: MIT
import {afterEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),insert:vi.fn().mockResolvedValue({error:null}),signal:vi.fn()}));
vi.mock('./supabase',()=>({supabase:{rpc:mocks.rpc,from:()=>({insert:mocks.insert})}}));
vi.mock('./executionScope',()=>({executionSignal:mocks.signal}));
import {executionIdentity} from './executionIdentity';
import {executePersonalPipelineStep,validatePersonalPipelineSteps} from './personalPipeline';
import type {Agent,PipelineStep} from './types';
afterEach(()=>{vi.clearAllMocks();vi.useRealTimers()});
const input={runId:'run',stepIndex:1,agentId:'agent',systemPrompt:'Approved system',userPrompt:'Supplied evidence'};
const execute=()=>executionIdentity.run({jobId:'run',attemptId:'attempt'},()=>executePersonalPipelineStep(input));
it('queues one approved context and returns native usage as unknown without API execution',async()=>{
    mocks.signal.mockReturnValue(new AbortController().signal);
    mocks.rpc.mockImplementation(async name=>({error:null,data:name==='queue_personal_pipeline_job'?'job':{status:'completed',result:'Reviewed evidence'}}));
    const result=await execute();
    expect(result).toMatchObject({result:'Reviewed evidence',usage:{usageKnown:false,billingModel:'unknown'}});
    expect(mocks.rpc).toHaveBeenCalledWith('queue_personal_pipeline_job',expect.objectContaining({p_run:'run',p_attempt:'attempt',p_step:1,p_prompt:'Supplied evidence'}));
    expect(mocks.rpc.mock.calls.some(([name])=>name==='cancel_personal_pipeline_job')).toBe(false);
});
it('cancels an offline queued job when the parent is cancelled, with no fallback or replay',async()=>{
    vi.useFakeTimers();const controller=new AbortController();mocks.signal.mockReturnValue(controller.signal);
    mocks.rpc.mockImplementation(async name=>({error:null,data:name==='queue_personal_pipeline_job'?'job':{status:'queued'}}));
    const result=execute();const rejected=expect(result).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(1);controller.abort();await rejected;
    expect(mocks.rpc.mock.calls.filter(([name])=>name==='queue_personal_pipeline_job')).toHaveLength(1);
    expect(mocks.rpc).toHaveBeenCalledWith('cancel_personal_pipeline_job',{p_run:'run',p_attempt:'attempt',p_step:1});
});
it('cleans up a queue request whose acknowledgement was lost',async()=>{
    mocks.signal.mockReturnValue(new AbortController().signal);
    mocks.rpc.mockResolvedValueOnce({error:{message:'Connection interrupted'},data:null}).mockResolvedValue({error:null});
    await expect(execute()).rejects.toThrow('interrupted');
    expect(mocks.rpc).toHaveBeenLastCalledWith('cancel_personal_pipeline_job',{p_run:'run',p_attempt:'attempt',p_step:1});
});
it('rejects paired fan-out steps before dispatch',()=>{
    const agent={config:{paired_device_id:'11111111-1111-4111-8111-111111111111',execution:{kind:'external'}},tools:[]} as unknown as Agent;
    expect(()=>validatePersonalPipelineSteps([{type:'fan_out',parallel_agents:['agent']}] as PipelineStep[],{agent})).toThrow(/sequential/);
});
it('does not interpret an invalid paired API configuration as permission to bill an API',()=>{
    const agent={config:{paired_device_id:'11111111-1111-4111-8111-111111111111',execution:{kind:'api'}},tools:[]} as unknown as Agent;
    expect(()=>validatePersonalPipelineSteps([{agent_id:'agent'}] as PipelineStep[],{agent})).toThrow(/paired native/);
});
