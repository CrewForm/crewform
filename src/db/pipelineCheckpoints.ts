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

/** Explicit download only; exclude agent secrets/config and file download URLs. */
export async function exportRunEvidence(run: TeamRun, messages: TeamMessage[], checkpoint: PipelineCheckpoint | null) {
    const [attempts, deliveries] = await Promise.all([
        supabase.from('execution_attempts').select('id,backend,runner_id,started_at,finished_at,terminal_status').eq('job_kind', 'team_runs').eq('job_id', run.id).order('started_at'),
        supabase.from('output_delivery_queue').select('id,route_kind,event,state,attempts,last_error,created_at').eq('job_id', run.id).eq('workspace_id', run.workspace_id).order('created_at'),
    ])
    if (attempts.error || deliveries.error) throw new Error('Could not load authorized run evidence. Try again.')
    const evidence = {format: 'crewform-run-evidence', version: 1, exportedAt: new Date().toISOString(),
        coverage: 'Records accessible to the signed-in user. Prompts, outputs and tool logs may contain private data.',
        run: {id: run.id, teamId: run.team_id, status: run.status, input: checkpoint?.configuration.input ?? run.input_task,
            output: run.output, error: run.error_message, createdAt: run.created_at},
        steps: checkpoint?.configuration.team.config.steps.map((step, index) => ({index, name: step.step_name,
            agent: checkpoint.configuration.agents[step.agent_id]?.name ?? step.agent_id, result: checkpoint.results[index] ?? null,
            committed: index < checkpoint.next_step, uncertain: index === checkpoint.in_flight})) ?? [],
        decisions: checkpoint?.decisions ?? [], attempts: attempts.data, deliveries: deliveries.data,
        messages: messages.map(message => ({type: message.message_type, step: message.step_idx, content: message.content,
            metadata: message.metadata, at: message.created_at})),
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(evidence, null, 2)], {type: 'application/json'}))
    const link = document.createElement('a')
    link.href = url; link.download = `crewform-run-${run.id}.json`; link.click()
    setTimeout(() => {URL.revokeObjectURL(url)}, 1000)
}
