// SPDX-License-Identifier: MIT
import { supabase } from '@/lib/supabase'
import type { Agent, PipelineConfig, TeamMessage, TeamRun } from '@/types'

export interface PipelineCheckpoint {
    run_id: string
    revision: number
    next_step: number
    in_flight: number | null
    attempt_id: string
    updated_at: string
    approval: {id: string; step: number; expiresAt: string} | null
    decisions: {actor: string; at: string; nextStep: number; approvalId: string | null; revision: number}[]
    results: ({output: string; usage: Record<string, unknown>; agentProvider: string; agentModel: string} | null)[]
    configuration: {version: number; input: string; team: {name: string; config: PipelineConfig}; agents: Partial<Record<string, Agent>>}
}
export async function fetchPipelineCheckpoint(runId: string) {
    const response = await supabase.from('pipeline_checkpoints').select('*').eq('run_id', runId).maybeSingle()
    if (response.error) throw response.error
    return response.data as PipelineCheckpoint | null
}
export async function continuePipeline(checkpoint: PipelineCheckpoint) {
    const response = await supabase.rpc('continue_pipeline_run', {p_run: checkpoint.run_id,
        p_revision: checkpoint.revision, p_approval: checkpoint.approval?.id ?? null})
    if (response.error) throw new Error(response.error.message)
}
export interface PersonalPipelineJob {
    id: string; step_idx: number; agent_id: string; device_id: string | null
    status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'uncertain'
    has_result: boolean; error: string | null
}
export async function fetchPersonalPipelineJobs(runId: string): Promise<PersonalPipelineJob[]> {
    const response = await supabase.from('personal_pipeline_jobs').select('id,step_idx,agent_id,device_id,status,has_result,error').eq('run_id',runId).order('created_at').limit(1000)
    if (response.error) throw response.error
    return response.data as PersonalPipelineJob[]
}
export async function fetchPersonalPipelineOutput(jobId: string): Promise<string | null> {
    const response = await supabase.from('personal_pipeline_jobs').select('result').eq('id',jobId).single()
    if (response.error) throw response.error
    return response.data.result as string | null
}

/** Explicit download only; exclude agent secrets/config and file download URLs. */
export async function exportRunEvidence(run: TeamRun, messages: TeamMessage[], checkpoint: PipelineCheckpoint | null) {
    const [attempts, deliveries, personalJobs] = await Promise.all([
        supabase.from('execution_attempts').select('id,backend,runner_id,started_at,finished_at,terminal_status').eq('job_kind', 'team_runs').eq('job_id', run.id).order('started_at').limit(1000),
        supabase.from('output_delivery_queue').select('id,route_kind,event,state,attempts,last_error,created_at').eq('job_id', run.id).eq('workspace_id', run.workspace_id).order('created_at').limit(1000),
        supabase.from('personal_pipeline_jobs').select('id,parent_attempt,attempt_id,step_idx,agent_id,device_id,status,result,error,created_at,started_at,finished_at').eq('run_id',run.id).order('created_at').limit(1000),
    ])
    if (attempts.error || deliveries.error || personalJobs.error) throw new Error('Could not load authorized run evidence. Try again.')
    const evidence = {format: 'crewform-run-evidence', version: 1, exportedAt: new Date().toISOString(),
        coverage: 'Records accessible to the signed-in user, up to 1000 per section. Prompts, outputs and tool logs may contain private data.',
        run: {id: run.id, teamId: run.team_id, status: run.status, input: checkpoint?.configuration.input ?? run.input_task,
            output: run.output, error: run.error_message, createdAt: run.created_at},
        steps: checkpoint?.configuration.team.config.steps.map((step, index) => ({index, name: step.step_name,
            agent: checkpoint.configuration.agents[step.agent_id]?.name ?? step.agent_id,
            result: checkpoint.results[index]?.usage.usageKnown === false ? {...checkpoint.results[index],
                usage: {...checkpoint.results[index]?.usage, promptTokens: null, completionTokens: null, totalTokens: null, costEstimateUSD: null}} : checkpoint.results[index] ?? null,
            committed: index < checkpoint.next_step, uncertain: index === checkpoint.in_flight})) ?? [],
        decisions: checkpoint?.decisions ?? [], attempts: attempts.data, deliveries: deliveries.data, personalJobs: personalJobs.data,
        messages: messages.map(message => ({type: message.message_type, step: message.step_idx, content: message.content,
            metadata: message.metadata, at: message.created_at})),
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(evidence, null, 2)], {type: 'application/json'}))
    const link = document.createElement('a')
    link.href = url; link.download = `crewform-run-${run.id}.json`; link.click()
    setTimeout(() => {URL.revokeObjectURL(url)}, 1000)
}
