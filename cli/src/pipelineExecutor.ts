// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm
//
// pipelineExecutor.ts — Local pipeline team execution engine.
// Runs multi-agent pipelines from JSON config with step-by-step handoffs.
// No Supabase dependency — all agents are inline in the config.

import chalk from 'chalk';
import { executeAgent } from './executor.js';
import type { AgentConfig, TeamConfig, PipelineStep } from './config.js';
import type { TokenUsage, ExecutionResult, ToolCallLog } from './types.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PipelineResult {
    /** Final output from the last step */
    output: string;
    /** Per-step results */
    steps: StepResult[];
    /** Aggregated usage across all steps */
    usage: TokenUsage;
}

interface StepResult {
    stepName: string;
    agentName: string;
    output: string;
    usage: TokenUsage;
    toolCallLogs: ToolCallLog[];
    status: 'completed' | 'failed' | 'skipped';
    error?: string;
}

interface FanOutBranchResult {
    agentName: string;
    status: 'completed' | 'failed';
    output: string | null;
    error?: string;
    usage: TokenUsage;
    toolCallLogs: ToolCallLog[];
}

export interface PipelineOptions {
    /** Show streaming output for each step */
    onStepStart?: (stepIndex: number, stepName: string, agentName: string) => void;
    /** Called when a step completes */
    onStepComplete?: (stepIndex: number, stepName: string, result: StepResult) => void;
    /** Stream text output for each step */
    onStream?: (delta: string) => void;
    /** Called when a tool is invoked */
    onToolCall?: (name: string, args: Record<string, unknown>) => void;
    /** Custom Ollama base URL */
    ollamaBaseUrl?: string;
}

// ─── Pipeline Executor ───────────────────────────────────────────────────────

/**
 * Execute a pipeline team locally.
 * Steps run sequentially, each agent receiving the previous step's output as context.
 * Fan-out steps run parallel agents and merge results.
 */
export async function executePipeline(
    team: TeamConfig,
    inputPrompt: string,
    options: PipelineOptions = {},
): Promise<PipelineResult> {
    const steps = team.config.steps ?? [];

    if (steps.length === 0) {
        throw new Error('Pipeline has no steps configured.');
    }

    // Build agent lookup by ref_id
    const agentMap = new Map<string, AgentConfig>();
    for (const entry of team.agents) {
        agentMap.set(entry.ref_id, entry.agent);
    }

    const stepResults: StepResult[] = [];
    const accumulatedOutputs: string[] = [];
    let previousOutput: string | null = null;
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalCost = 0;

    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];

        if (step.type === 'fan_out' && step.parallel_agents && step.parallel_agents.length > 0) {
            // ── Fan-Out Step ──
            const fanOutResult = await executeFanOutStep(
                step, i, inputPrompt, previousOutput, accumulatedOutputs,
                agentMap, options,
            );

            stepResults.push(fanOutResult);

            if (fanOutResult.status === 'completed') {
                accumulatedOutputs.push(fanOutResult.output);
                previousOutput = fanOutResult.output;
                totalPromptTokens += fanOutResult.usage.promptTokens;
                totalCompletionTokens += fanOutResult.usage.completionTokens;
                totalCost += fanOutResult.usage.costEstimateUSD;
            }
        } else {
            // ── Sequential Step ──
            const agentRef = step.agent_ref ?? step.agent_id;
            if (!agentRef) {
                throw new Error(`Step "${step.step_name}" has no agent_ref or agent_id.`);
            }

            const agent = agentMap.get(agentRef);
            if (!agent) {
                throw new Error(
                    `Agent "${agentRef}" not found for step "${step.step_name}". ` +
                    `Available agents: ${Array.from(agentMap.keys()).join(', ')}`,
                );
            }

            const stepResult = await executeStepWithRetry(
                step, i, agent, inputPrompt, previousOutput, accumulatedOutputs, options,
            );

            stepResults.push(stepResult);

            if (stepResult.status === 'completed') {
                accumulatedOutputs.push(stepResult.output);
                previousOutput = stepResult.output;
                totalPromptTokens += stepResult.usage.promptTokens;
                totalCompletionTokens += stepResult.usage.completionTokens;
                totalCost += stepResult.usage.costEstimateUSD;
            }
        }
    }

    const totalTokens = totalPromptTokens + totalCompletionTokens;

    return {
        output: previousOutput ?? '',
        steps: stepResults,
        usage: {
            promptTokens: totalPromptTokens,
            completionTokens: totalCompletionTokens,
            totalTokens,
            costEstimateUSD: totalCost,
        },
    };
}

// ─── Step Execution ──────────────────────────────────────────────────────────

async function executeStepWithRetry(
    step: PipelineStep,
    stepIndex: number,
    agent: AgentConfig,
    inputTask: string,
    previousOutput: string | null,
    accumulatedOutputs: string[],
    options: PipelineOptions,
    fanOutResults?: FanOutBranchResult[],
): Promise<StepResult> {
    const maxAttempts = step.on_failure === 'retry' ? (step.max_retries ?? 1) + 1 : 1;

    options.onStepStart?.(stepIndex, step.step_name, agent.name);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            // Build the step prompt with handoff context
            const prompt = buildStepPrompt(step, {
                input: inputTask,
                previousOutput,
                stepIndex,
                stepName: step.step_name,
                accumulatedOutputs,
                fanOutResults,
            });

            const result = await executeAgent(agent, {
                prompt,
                onStream: options.onStream,
                onToolCall: options.onToolCall,
                ollamaBaseUrl: options.ollamaBaseUrl,
            });

            const stepResult: StepResult = {
                stepName: step.step_name,
                agentName: agent.name,
                output: result.result,
                usage: result.usage,
                toolCallLogs: result.toolCallLogs,
                status: 'completed',
            };

            options.onStepComplete?.(stepIndex, step.step_name, stepResult);

            return stepResult;
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);

            if (attempt >= maxAttempts) {
                if (step.on_failure === 'skip') {
                    const skipResult: StepResult = {
                        stepName: step.step_name,
                        agentName: agent.name,
                        output: '',
                        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, costEstimateUSD: 0 },
                        toolCallLogs: [],
                        status: 'skipped',
                        error: errMsg,
                    };
                    options.onStepComplete?.(stepIndex, step.step_name, skipResult);
                    return skipResult;
                }

                throw new Error(`Step "${step.step_name}" failed after ${attempt} attempt(s): ${errMsg}`);
            }
        }
    }

    // Should never reach here
    throw new Error(`Step "${step.step_name}" failed unexpectedly.`);
}

// ─── Fan-Out Execution ───────────────────────────────────────────────────────

async function executeFanOutStep(
    step: PipelineStep,
    stepIndex: number,
    inputTask: string,
    previousOutput: string | null,
    accumulatedOutputs: string[],
    agentMap: Map<string, AgentConfig>,
    options: PipelineOptions,
): Promise<StepResult> {
    const parallelRefs = step.parallel_agents ?? [];
    const mergeRef = step.merge_agent_ref ?? step.merge_agent_id;
    const failureMode = step.fan_out_failure ?? 'fail_fast';

    // ── Execute all parallel branches ──
    const branchPromises = parallelRefs.map(async (ref, branchIdx): Promise<FanOutBranchResult> => {
        const agent = agentMap.get(ref);
        if (!agent) {
            return {
                agentName: ref,
                status: 'failed',
                output: null,
                error: `Agent "${ref}" not found`,
                usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, costEstimateUSD: 0 },
                toolCallLogs: [],
            };
        }

        try {
            const branchStep: PipelineStep = {
                agent_ref: ref,
                step_name: `${step.step_name} [Branch ${branchIdx + 1}]`,
                instructions: step.instructions,
                expected_output: step.expected_output,
                on_failure: 'stop',
                max_retries: 0,
                type: 'sequential',
                fan_out_failure: 'fail_fast',
            };

            const prompt = buildStepPrompt(branchStep, {
                input: inputTask,
                previousOutput,
                stepIndex,
                stepName: branchStep.step_name,
                accumulatedOutputs,
            });

            const result = await executeAgent(agent, {
                prompt,
                onToolCall: options.onToolCall,
                ollamaBaseUrl: options.ollamaBaseUrl,
            });

            return {
                agentName: agent.name,
                status: 'completed',
                output: result.result,
                usage: result.usage,
                toolCallLogs: result.toolCallLogs,
            };
        } catch (err) {
            return {
                agentName: agent.name,
                status: 'failed',
                output: null,
                error: err instanceof Error ? err.message : String(err),
                usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, costEstimateUSD: 0 },
                toolCallLogs: [],
            };
        }
    });

    let branchResults: FanOutBranchResult[];

    if (failureMode === 'fail_fast') {
        branchResults = await Promise.all(branchPromises);
        const failed = branchResults.find(b => b.status === 'failed');
        if (failed) {
            throw new Error(`Fan-out step "${step.step_name}" failed (fail_fast): ${failed.error}`);
        }
    } else {
        branchResults = await Promise.all(
            branchPromises.map(p => p.catch((err): FanOutBranchResult => ({
                agentName: 'unknown',
                status: 'failed',
                output: null,
                error: err instanceof Error ? err.message : String(err),
                usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, costEstimateUSD: 0 },
                toolCallLogs: [],
            }))),
        );
    }

    const completedBranches = branchResults.filter(b => b.status === 'completed');
    if (completedBranches.length === 0) {
        throw new Error(`Fan-out step "${step.step_name}" failed: all branches failed.`);
    }

    // Aggregate branch usage
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalCost = 0;
    const allToolLogs: ToolCallLog[] = [];
    for (const branch of branchResults) {
        totalPromptTokens += branch.usage.promptTokens;
        totalCompletionTokens += branch.usage.completionTokens;
        totalCost += branch.usage.costEstimateUSD;
        allToolLogs.push(...branch.toolCallLogs);
    }

    // ── Merge Step ──
    if (mergeRef) {
        const mergeAgent = agentMap.get(mergeRef);
        if (!mergeAgent) {
            throw new Error(`Merge agent "${mergeRef}" not found for fan-out step "${step.step_name}".`);
        }

        const mergeStep: PipelineStep = {
            agent_ref: mergeRef,
            step_name: `${step.step_name} [Merge]`,
            instructions: step.merge_instructions ?? 'Review and aggregate the outputs from all parallel branches into a single cohesive result.',
            expected_output: step.expected_output,
            on_failure: step.on_failure,
            max_retries: step.max_retries,
            type: 'sequential',
            fan_out_failure: 'fail_fast',
        };

        const mergeResult = await executeStepWithRetry(
            mergeStep, stepIndex, mergeAgent,
            inputTask, null, accumulatedOutputs, options,
            branchResults,
        );

        totalPromptTokens += mergeResult.usage.promptTokens;
        totalCompletionTokens += mergeResult.usage.completionTokens;
        totalCost += mergeResult.usage.costEstimateUSD;

        return {
            stepName: step.step_name,
            agentName: `Fan-out (${branchResults.length} branches) → ${mergeAgent.name}`,
            output: mergeResult.output,
            usage: {
                promptTokens: totalPromptTokens,
                completionTokens: totalCompletionTokens,
                totalTokens: totalPromptTokens + totalCompletionTokens,
                costEstimateUSD: totalCost,
            },
            toolCallLogs: [...allToolLogs, ...mergeResult.toolCallLogs],
            status: 'completed',
        };
    }

    // No merge agent — concatenate branch outputs
    const concatenated = completedBranches
        .map((b, i) => `## Branch ${i + 1} — ${b.agentName}\n\n${b.output}`)
        .join('\n\n---\n\n');

    return {
        stepName: step.step_name,
        agentName: `Fan-out (${completedBranches.length}/${branchResults.length} branches)`,
        output: concatenated,
        usage: {
            promptTokens: totalPromptTokens,
            completionTokens: totalCompletionTokens,
            totalTokens: totalPromptTokens + totalCompletionTokens,
            costEstimateUSD: totalCost,
        },
        toolCallLogs: allToolLogs,
        status: 'completed',
    };
}

// ─── Prompt Builder ──────────────────────────────────────────────────────────

interface StepContext {
    input: string;
    previousOutput: string | null;
    stepIndex: number;
    stepName: string;
    accumulatedOutputs: string[];
    fanOutResults?: FanOutBranchResult[];
}

function buildStepPrompt(step: PipelineStep, context: StepContext): string {
    const parts: string[] = [];

    parts.push(`## Task\n${context.input}`);

    if (context.previousOutput) {
        parts.push(
            `## Previous Step Output\nThe previous step in this pipeline produced the following output:\n\n${context.previousOutput}`,
        );
    }

    // Fan-out merge context
    if (context.fanOutResults && context.fanOutResults.length > 0) {
        const branchParts = context.fanOutResults.map((branch, idx) => {
            if (branch.status === 'completed') {
                return `### Branch ${idx + 1} — ${branch.agentName} ✅\n${branch.output}`;
            }
            return `### Branch ${idx + 1} — ${branch.agentName} ❌ (Failed)\nError: ${branch.error ?? 'Unknown error'}`;
        });

        const completedCount = context.fanOutResults.filter(b => b.status === 'completed').length;
        const totalCount = context.fanOutResults.length;

        parts.push(
            `## Fan-Out Results (${completedCount}/${totalCount} branches completed)\n` +
            `The following agents processed the task in parallel. Review and aggregate their outputs.\n\n` +
            branchParts.join('\n\n'),
        );
    }

    if (step.instructions) {
        parts.push(`## Your Instructions\n${step.instructions}`);
    }

    if (step.expected_output) {
        parts.push(`## Expected Output Format\n${step.expected_output}`);
    }

    if (context.accumulatedOutputs.length > 1) {
        parts.push(
            `## Pipeline Context\nThis is step ${context.stepIndex + 1} in a multi-step pipeline. ` +
            `${context.accumulatedOutputs.length} previous steps have completed.`,
        );
    }

    return parts.join('\n\n');
}
