// SPDX-License-Identifier: MIT
import type { TokenUsage } from './types';

export interface PipelineStepResult {
    output: string;
    usage: TokenUsage;
    agentProvider: string;
    agentModel: string;
}
export interface BoundaryCheckpoint {
    next_step: number;
    in_flight: number | null;
    results: (PipelineStepResult | null)[];
}
export function pipelineTotals(results: BoundaryCheckpoint['results']) {
    const completed = results.filter((result): result is PipelineStepResult => result !== null);
    return {outputs: completed.map(result => result.output),
        tokens: completed.reduce((sum, result) => sum + result.usage.totalTokens, 0),
        cost: completed.reduce((sum, result) => sum + result.usage.costEstimateUSD, 0)};
}

/** The production loop. Persistence/authority checks must finish before dispatch. */
export async function runCheckpointedPipeline(options: {
    checkpoint: BoundaryCheckpoint;
    stepCount: number;
    autoHandoff: boolean;
    start: (index: number) => Promise<void>;
    execute: (index: number, outputs: string[]) => Promise<PipelineStepResult | null>;
    commit: (index: number, result: PipelineStepResult | null) => Promise<void>;
    afterCommit?: (index: number, result: PipelineStepResult | null) => Promise<void>;
    pause: () => Promise<void>;
}) {
    const checkpoint = options.checkpoint;
    if (checkpoint.in_flight !== null) throw new Error('Prior step outcome is uncertain; review effects and create a new run.');
    if (checkpoint.results.length !== checkpoint.next_step || checkpoint.next_step > options.stepCount)
        throw new Error('Invalid pipeline checkpoint.');
    const results = [...checkpoint.results];
    for (let index = checkpoint.next_step; index < options.stepCount; index++) {
        await options.start(index);
        const result = await options.execute(index, pipelineTotals(results).outputs);
        await options.commit(index, result);
        results.push(result);
        await options.afterCommit?.(index, result);
        if (!options.autoHandoff && index + 1 < options.stepCount) {
            await options.pause();
            return {paused: true, ...pipelineTotals(results)};
        }
    }
    return {paused: false, ...pipelineTotals(results)};
}
