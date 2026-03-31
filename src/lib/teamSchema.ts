// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { z } from 'zod'

/**
 * Zod schemas for team creation and pipeline configuration.
 */

export const pipelineStepSchema = z.object({
    agent_id: z.string().min(1, 'Select an agent for this step'),
    step_name: z.string().min(1, 'Step name is required').max(100),
    instructions: z.string().max(5000).default(''),
    expected_output: z.string().max(2000).default(''),
    on_failure: z.enum(['retry', 'stop', 'skip']).default('stop'),
    max_retries: z.number().int().min(0).max(5).default(1),
    type: z.enum(['sequential', 'fan_out']).default('sequential'),
    parallel_agents: z.array(z.string()).optional(),
    merge_agent_id: z.string().optional(),
    fan_out_failure: z.enum(['fail_fast', 'continue_on_partial']).default('fail_fast'),
    merge_instructions: z.string().max(5000).default(''),
})

export const teamSchema = z.object({
    name: z
        .string()
        .min(1, 'Team name is required')
        .max(100, 'Team name must be 100 characters or less')
        .trim(),
    description: z
        .string()
        .max(1000, 'Description must be 1,000 characters or less')
        .default(''),
    mode: z.enum(['pipeline', 'orchestrator']).default('pipeline'),
})

export const orchestratorConfigSchema = z.object({
    brain_agent_id: z.string().min(1, 'Select a brain agent'),
    worker_agent_ids: z.array(z.string()).min(1, 'Add at least one worker agent'),
    quality_threshold: z.number().min(0).max(1).default(0.7),
    routing_strategy: z.string().default('auto'),
    planner_enabled: z.boolean().default(false),
    max_delegation_depth: z.number().int().min(1).max(10).default(3),
})

export type TeamFormData = z.infer<typeof teamSchema>
export type PipelineStepFormData = z.infer<typeof pipelineStepSchema>
export type OrchestratorConfigFormData = z.infer<typeof orchestratorConfigSchema>
