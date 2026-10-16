// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm
import { z } from 'zod';
import { executePipeline, type PipelineOptions } from './pipelineExecutor.js';
import type { AgentConfig, TeamConfig, PipelineStep } from './config.js';

// Deliberately fixed input and scripted output. This demonstrates orchestration,
// not a model's ability to discover a bug. No provider or native agent is invoked.
export const DEMO_PATCH = `Supplied fictional patch P1 (checkout.ts):
1  function total(subtotal: number, shipping: number) {
2 -  return subtotal + shipping;
3 +  return subtotal;
4  }`;

const findingSchema = z.object({
    id: z.literal('F1'), source: z.literal('P1:3'),
    title: z.string().min(1), evidence: z.string().min(1),
}).strict();
const reviewSchema = z.object({schemaVersion: z.literal(1), findings: z.array(findingSchema).length(1)}).strict();
const critiqueSchema = z.object({
    schemaVersion: z.literal(1), findingId: z.literal('F1'), source: z.literal('P1:3'),
    verdict: z.literal('supported'), limitation: z.string().min(1),
}).strict();
export const demoPackSchema = z.object({
    schemaVersion: z.literal(1), simulated: z.literal(true),
    humanReview: z.literal('required'),
    findings: z.array(findingSchema).length(1), critique: critiqueSchema,
}).strict();

export async function runOfflineDemo(execute?: PipelineOptions['execute']) {
    const names = ['Reviewer', 'Critic', 'Packager'];
    const agents = names.map((name, position) => ({
        ref_id: name.toLowerCase(), role: 'worker', position,
        agent: {name, description: '', model: 'scripted-fixture', provider: null,
            fallback_model: null, system_prompt: '', temperature: 0, max_tokens: null,
            tools: [], voice_profile: null, config: {}, tags: []} satisfies AgentConfig,
    }));
    const team: TeamConfig = {
        name: 'Offline review pack', description: 'Simulated supplied-patch walkthrough', mode: 'pipeline', agents,
        config: {auto_handoff: true, steps: names.map(name => ({
            agent_ref: name.toLowerCase(), step_name: name,
            instructions: 'Use only supplied evidence. Return the versioned JSON handoff.',
            expected_output: 'JSON schema version 1', on_failure: 'stop', max_retries: 0,
            type: 'sequential', fan_out_failure: 'fail_fast',
        } satisfies PipelineStep))},
    };
    let review: z.infer<typeof reviewSchema>;
    let critique: z.infer<typeof critiqueSchema>;
    const scripted: NonNullable<PipelineOptions['execute']> = async (agent, options) => {
        if (!options.prompt.includes(DEMO_PATCH)) throw new Error('Supplied patch missing from handoff.');
        let output: unknown;
        switch (agent.name) {
            case 'Reviewer':
                output = {schemaVersion: 1, findings: [{id: 'F1', source: 'P1:3', title: 'Shipping omitted from total',
                    evidence: 'The new return expression uses subtotal alone; the prior expression added shipping.'}]};
                break;
            case 'Critic':
                if (!options.prompt.includes(JSON.stringify(review))) throw new Error('Review handoff missing.');
                output = {schemaVersion: 1, findingId: 'F1', source: 'P1:3', verdict: 'supported',
                    limitation: 'Fictional patch only; call sites, requirements and tests were not supplied.'};
                break;
            default:
                if (!options.prompt.includes(JSON.stringify(critique))) throw new Error('Critique handoff missing.');
                output = {schemaVersion: 1, simulated: true, humanReview: 'required', findings: review.findings, critique};
        }
        return {result: JSON.stringify(output), usage: {promptTokens: 0, completionTokens: 0, totalTokens: 0,
            costEstimateUSD: 0, usageKnown: true, billingModel: 'simulated'}, toolCallLogs: []};
    };
    const result = await executePipeline(team, DEMO_PATCH, {execute: async (agent, options) => {
        const response = await (execute ?? scripted)(agent, options);
        // Validate before returning to the pipeline: invalid output never reaches
        // the next agent, including when using an injected test executor.
        const value: unknown = JSON.parse(response.result);
        if (agent.name === 'Reviewer') review = reviewSchema.parse(value);
        else if (agent.name === 'Critic') critique = critiqueSchema.parse(value);
        else demoPackSchema.parse(value);
        return response;
    }});
    return {simulated: true as const, input: DEMO_PATCH, ...result, pack: demoPackSchema.parse(JSON.parse(result.output))};
}
