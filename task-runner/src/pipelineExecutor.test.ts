// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

/**
 * Unit tests for buildStepPrompt (pipeline handoff context).
 *
 * Exercises the production formatter, including handoff and memory context.
 */

import { describe, it, expect } from 'vitest';
import type { PipelineStep, TeamHandoffContext } from './types';

import {buildStepPrompt} from './pipelinePrompt';

describe('buildStepPrompt', () => {
    const baseStep: PipelineStep = {
        agent_id: 'agent-1',
        step_name: 'analysis',
        instructions: '',
        expected_output: '',
        on_failure: 'stop',
        max_retries: 0,
    };

    const baseContext: TeamHandoffContext = {
        input: 'Analyze this data',
        previous_output: null,
        step_index: 0,
        step_name: 'analysis',
        accumulated_outputs: [],
    };

    it('includes the task input', () => {
        const result = buildStepPrompt(baseStep, baseContext);
        expect(result).toContain('## Task');
        expect(result).toContain('Analyze this data');
    });

    it('omits previous output when null', () => {
        const result = buildStepPrompt(baseStep, baseContext);
        expect(result).not.toContain('Previous Step Output');
    });

    it('includes previous output when provided', () => {
        const context: TeamHandoffContext = {
            ...baseContext,
            previous_output: 'Step 1 produced this result',
        };
        const result = buildStepPrompt(baseStep, context);
        expect(result).toContain('## Previous Step Output');
        expect(result).toContain('Step 1 produced this result');
    });

    it('includes step instructions when provided', () => {
        const step: PipelineStep = {
            ...baseStep,
            instructions: 'Focus on key metrics',
        };
        const result = buildStepPrompt(step, baseContext);
        expect(result).toContain('## Your Instructions');
        expect(result).toContain('Focus on key metrics');
    });

    it('omits instructions when not provided', () => {
        const result = buildStepPrompt(baseStep, baseContext);
        expect(result).not.toContain('Your Instructions');
    });

    it('includes expected output format when provided', () => {
        const step: PipelineStep = {
            ...baseStep,
            expected_output: 'JSON array of findings',
        };
        const result = buildStepPrompt(step, baseContext);
        expect(result).toContain('## Expected Output Format');
        expect(result).toContain('JSON array of findings');
    });

    it('includes pipeline context for multi-step pipelines', () => {
        const context: TeamHandoffContext = {
            ...baseContext,
            step_index: 2,
            accumulated_outputs: ['output1', 'output2', 'output3'],
        };
        const result = buildStepPrompt(baseStep, context);
        expect(result).toContain('## Pipeline Context');
        expect(result).toContain('step 3');
        expect(result).toContain('3 previous steps');
    });

    it('omits pipeline context for first step', () => {
        const context: TeamHandoffContext = {
            ...baseContext,
            step_index: 0,
            accumulated_outputs: [],
        };
        const result = buildStepPrompt(baseStep, context);
        expect(result).not.toContain('Pipeline Context');
    });

    it('builds full prompt with all sections', () => {
        const step: PipelineStep = {
            ...baseStep,
            instructions: 'Summarize findings',
            expected_output: 'Markdown report',
        };
        const context: TeamHandoffContext = {
            input: 'Review the codebase',
            previous_output: 'Found 5 issues',
            step_index: 2,
            step_name: 'summarize',
            accumulated_outputs: ['a', 'b', 'c'],
        };
        const result = buildStepPrompt(step, context);
        expect(result).toContain('## Task');
        expect(result).toContain('## Previous Step Output');
        expect(result).toContain('## Your Instructions');
        expect(result).toContain('## Expected Output Format');
        expect(result).toContain('## Pipeline Context');
    });
});
