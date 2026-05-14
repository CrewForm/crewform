// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm
//
// config.ts — Parse and validate agent/team JSON config files.

import { z } from 'zod';
import { readFileSync, existsSync } from 'fs';

// ─── Schemas ─────────────────────────────────────────────────────────────────

/** Voice profile schema */
const voiceProfileSchema = z.object({
    tone: z.string().optional(),
    custom_instructions: z.string().optional(),
    output_format_hints: z.string().optional(),
}).optional().nullable();

/** Simplified inline agent config (quick usage) */
const inlineAgentSchema = z.object({
    name: z.string().default('CLI Agent'),
    description: z.string().default(''),
    model: z.string().default('llama3.3'),
    fallback_model: z.string().nullable().default(null),
    provider: z.string().nullable().default(null),
    system_prompt: z.string().default('You are a helpful AI assistant.'),
    temperature: z.number().min(0).max(2).default(0.7),
    max_tokens: z.number().nullable().default(null),
    tools: z.array(z.string()).default([]),
    voice_profile: voiceProfileSchema.default(null),
    config: z.record(z.string(), z.unknown()).default({}),
    tags: z.array(z.string()).default([]),
});

/** crewform-export v1 agent data schema */
const agentExportSchema = z.object({
    name: z.string(),
    description: z.string().default(''),
    model: z.string(),
    fallback_model: z.string().nullable().default(null),
    provider: z.string().nullable().default(null),
    system_prompt: z.string(),
    temperature: z.number().default(0.7),
    max_tokens: z.number().nullable().default(null),
    tools: z.array(z.string()).default([]),
    voice_profile: voiceProfileSchema.default(null),
    config: z.record(z.string(), z.unknown()).default({}),
    tags: z.array(z.string()).default([]),
});

/** Pipeline step schema */
const pipelineStepSchema = z.object({
    agent_id: z.string().optional(),
    agent_ref: z.string().optional(), // For inline team format — references agent by name
    step_name: z.string(),
    instructions: z.string().default(''),
    expected_output: z.string().default(''),
    on_failure: z.enum(['retry', 'stop', 'skip']).default('stop'),
    max_retries: z.number().default(1),
    type: z.enum(['sequential', 'fan_out']).default('sequential'),
    parallel_agents: z.array(z.string()).optional(),
    merge_agent_id: z.string().optional(),
    merge_agent_ref: z.string().optional(),
    fan_out_failure: z.enum(['fail_fast', 'continue_on_partial']).default('fail_fast'),
    merge_instructions: z.string().optional(),
});

/** Team export schema */
const teamExportSchema = z.object({
    name: z.string(),
    description: z.string().default(''),
    mode: z.enum(['pipeline', 'orchestrator', 'collaboration']).default('pipeline'),
    config: z.object({
        steps: z.array(pipelineStepSchema).optional(),
        auto_handoff: z.boolean().default(true),
    }).passthrough(),
    agents: z.array(z.object({
        ref_id: z.string(),
        role: z.string().default('worker'),
        position: z.number().default(0),
        agent: agentExportSchema,
    })),
});

/** Full crewform-export wrapper */
const exportWrapperSchema = z.object({
    format: z.literal('crewform-export'),
    version: z.number(),
    exported_at: z.string().optional(),
    type: z.enum(['agent', 'team']),
    data: z.unknown(),
});

// ─── Types ───────────────────────────────────────────────────────────────────

export type AgentConfig = z.infer<typeof agentExportSchema>;
export type TeamConfig = z.infer<typeof teamExportSchema>;
export type PipelineStep = z.infer<typeof pipelineStepSchema>;

export interface ParsedConfig {
    type: 'agent' | 'team';
    agent?: AgentConfig;
    team?: TeamConfig;
}

// ─── Parser ──────────────────────────────────────────────────────────────────

/**
 * Parse a JSON config file. Supports three formats:
 * 1. crewform-export v1 (agent or team)
 * 2. Simplified inline agent config (just name, model, system_prompt)
 * 3. Simplified inline team config (agents array + pipeline steps)
 */
export function parseConfigFile(filePath: string): ParsedConfig {
    if (!existsSync(filePath)) {
        throw new Error(`Config file not found: ${filePath}`);
    }

    const raw = readFileSync(filePath, 'utf-8');
    let json: unknown;
    try {
        json = JSON.parse(raw);
    } catch {
        throw new Error(`Invalid JSON in ${filePath}`);
    }

    const obj = json as Record<string, unknown>;

    // Check if it's a crewform-export wrapper
    if (obj.format === 'crewform-export') {
        const wrapper = exportWrapperSchema.parse(obj);
        if (wrapper.version > 1) {
            throw new Error(`Unsupported export version: ${wrapper.version}. Please update the CLI.`);
        }

        if (wrapper.type === 'agent') {
            const agent = agentExportSchema.parse(wrapper.data);
            return { type: 'agent', agent };
        } else {
            const team = teamExportSchema.parse(wrapper.data);
            return { type: 'team', team };
        }
    }

    // Check if it looks like a team config (has 'agents' array and 'mode' or 'config.steps')
    if (Array.isArray(obj.agents) && (obj.mode || (obj.config && typeof obj.config === 'object'))) {
        const team = teamExportSchema.parse(obj);
        return { type: 'team', team };
    }

    // Otherwise treat as inline agent config
    const agent = inlineAgentSchema.parse(obj);
    return { type: 'agent', agent };
}

/**
 * Validate a config file and return any errors.
 */
export function validateConfigFile(filePath: string): { valid: boolean; errors: string[] } {
    try {
        parseConfigFile(filePath);
        return { valid: true, errors: [] };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { valid: false, errors: [msg] };
    }
}

// ─── Scaffolding ─────────────────────────────────────────────────────────────

/** Generate a starter agent config JSON */
export function generateAgentConfig(options?: {
    name?: string;
    model?: string;
    provider?: string;
}): string {
    const config = {
        name: options?.name ?? 'My Agent',
        model: options?.model ?? 'llama3.3',
        provider: options?.provider ?? null,
        system_prompt: 'You are a helpful AI assistant. Be concise and accurate.',
        temperature: 0.7,
        max_tokens: null,
        tools: [],
        voice_profile: null,
    };
    return JSON.stringify(config, null, 2);
}

/** Generate a starter pipeline team config JSON */
export function generateTeamConfig(): string {
    const config = {
        name: 'My Pipeline',
        description: 'A two-agent pipeline',
        mode: 'pipeline',
        config: {
            steps: [
                {
                    agent_ref: 'researcher',
                    step_name: 'Research',
                    instructions: 'Research the topic thoroughly.',
                    expected_output: 'A comprehensive research summary.',
                    on_failure: 'stop',
                },
                {
                    agent_ref: 'writer',
                    step_name: 'Write',
                    instructions: 'Write a polished article based on the research.',
                    expected_output: 'A well-written article.',
                    on_failure: 'stop',
                },
            ],
            auto_handoff: true,
        },
        agents: [
            {
                ref_id: 'researcher',
                role: 'worker',
                position: 0,
                agent: {
                    name: 'Researcher',
                    description: 'Researches topics thoroughly',
                    model: 'llama3.3',
                    system_prompt: 'You are an expert researcher. Provide detailed, well-sourced analysis.',
                    temperature: 0.5,
                    tools: ['web_search'],
                },
            },
            {
                ref_id: 'writer',
                role: 'worker',
                position: 1,
                agent: {
                    name: 'Writer',
                    description: 'Writes polished content',
                    model: 'llama3.3',
                    system_prompt: 'You are a skilled writer. Create clear, engaging content from research material.',
                    temperature: 0.8,
                    tools: [],
                },
            },
        ],
    };
    return JSON.stringify(config, null, 2);
}
