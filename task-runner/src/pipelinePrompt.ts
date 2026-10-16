// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm
import {handoffInstructions} from './handoffContract';
import type {PipelineStep, TeamHandoffContext} from './types';
import {buildMemoryContext} from './memoryContext';

export function buildStepPrompt(step: PipelineStep, context: TeamHandoffContext): string {
    const parts: string[] = [];

    parts.push(`## Task\n${context.input}`);

    if (context.previous_output) {
        parts.push(`## Previous Step Output\nThe previous step in this pipeline produced the following output:\n\n${context.previous_output}`);
    }

    // Fan-out merge context — format all parallel branch results for the merge agent
    if (context.fan_out_results && context.fan_out_results.length > 0) {
        const branchParts = context.fan_out_results.map((branch, idx) => {
            if (branch.status === 'completed') {
                return `### Branch ${idx + 1} — ${branch.agent_name} ✅\n${branch.output}`;
            }
            return `### Branch ${idx + 1} — ${branch.agent_name} ❌ (Failed)\nError: ${branch.error ?? 'Unknown error'}`;
        });

        const completedCount = context.fan_out_results.filter(b => b.status === 'completed').length;
        const totalCount = context.fan_out_results.length;

        parts.push(
            `## Fan-Out Results (${completedCount}/${totalCount} branches completed)\n` +
            `The following agents processed the task in parallel. Review and aggregate their outputs.\n\n` +
            branchParts.join('\n\n')
        );
    }

    if (step.instructions) {
        parts.push(`## Your Instructions\n${step.instructions}`);
    }

    if (step.expected_output) {
        parts.push(`## Expected Output Format\n${step.expected_output}`);
    }

    if (context.accumulated_outputs.length > 1) {
        parts.push(`## Pipeline Context\nThis is step ${context.step_index + 1} in a multi-step pipeline. ${context.accumulated_outputs.length} previous steps have completed.`);
    }

    // Inject team memory context
    if (context.team_memories && context.team_memories.length > 0) {
        parts.push(buildMemoryContext(context.team_memories));
    }

    return parts.join('\n\n') + handoffInstructions(step.output_contract);
}

