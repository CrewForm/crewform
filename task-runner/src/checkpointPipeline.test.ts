// SPDX-License-Identifier: MIT
import {expect, it, vi} from 'vitest';
import {runCheckpointedPipeline, type BoundaryCheckpoint, type PipelineStepResult} from './checkpointPipeline';

const output = (index: number): PipelineStepResult => ({output: `evidence-${index}`,
    usage: {promptTokens: 2, completionTokens: 3, totalTokens: 5, costEstimateUSD: 0.01},
    agentProvider: 'openai', agentModel: 'fixture'});
function fixture() {
    // Serialize between operations so the tests cannot rely on shared in-memory
    // results. This is the same loop the production executor uses.
    let persisted = JSON.stringify({next_step: 0, in_flight: null, results: []});
    const read = () => JSON.parse(persisted) as BoundaryCheckpoint;
    let authorized = true;
    const save = (value: BoundaryCheckpoint) => {persisted = JSON.stringify(value)};
    const start = vi.fn(async (index: number) => {
        if (!authorized) throw new Error('Cancelled or stale attempt');
        save({...read(), in_flight: index});
        await Promise.resolve();
    });
    const commit = vi.fn(async (index: number, result: PipelineStepResult | null) => {
        if (!authorized) throw new Error('Cancelled or stale attempt');
        save({next_step: index + 1, in_flight: null, results: [...read().results, result]});
        await Promise.resolve();
    });
    const execute = vi.fn(async (index: number, _outputs: string[]) => output(index));
    return {read, revoke: () => {authorized = false}, start, commit, execute,
        pause: vi.fn(async () => {await Promise.resolve()})};
}
it('continues across a process restart using only committed outputs and cumulative usage', async () => {
    const store = fixture();
    const paused = await runCheckpointedPipeline({...store, checkpoint: store.read(), stepCount: 3, autoHandoff: false});
    expect(paused.paused).toBe(true);
    expect(store.read().next_step).toBe(1);
    store.execute.mockClear();
    const result = await runCheckpointedPipeline({...store, checkpoint: store.read(), stepCount: 3, autoHandoff: true});
    expect(store.execute.mock.calls).toEqual([[1, ['evidence-0']], [2, ['evidence-0', 'evidence-1']]]);
    expect(result).toMatchObject({paused: false, tokens: 15, cost: 0.03});
});
it('does not replay a call whose result was never committed', async () => {
    const store = fixture();
    store.execute.mockRejectedValueOnce(new Error('process interrupted'));
    await expect(runCheckpointedPipeline({...store, checkpoint: store.read(), stepCount: 3, autoHandoff: true})).rejects.toThrow('interrupted');
    store.execute.mockClear();
    await expect(runCheckpointedPipeline({...store, checkpoint: store.read(), stepCount: 3, autoHandoff: true})).rejects.toThrow('uncertain');
    expect(store.execute).not.toHaveBeenCalled();
});
it('checks authority before dispatch and before committing a late result', async () => {
    const store = fixture();
    store.revoke();
    await expect(runCheckpointedPipeline({...store, checkpoint: store.read(), stepCount: 1, autoHandoff: true})).rejects.toThrow('stale');
    expect(store.execute).not.toHaveBeenCalled();
    const late = fixture();
    late.execute.mockImplementationOnce(async index => {late.revoke(); return output(index)});
    await expect(runCheckpointedPipeline({...late, checkpoint: late.read(), stepCount: 1, autoHandoff: true})).rejects.toThrow('stale');
    expect(late.read()).toMatchObject({next_step: 0, in_flight: 0, results: []});
});
it('recovers after commit even if post-commit bookkeeping failed, without duplicate calls', async () => {
    const store = fixture();
    await expect(runCheckpointedPipeline({...store, checkpoint: store.read(), stepCount: 2, autoHandoff: true,
        afterCommit: async () => {throw new Error('bookkeeping interrupted')}})).rejects.toThrow('bookkeeping');
    store.execute.mockClear();
    await runCheckpointedPipeline({...store, checkpoint: store.read(), stepCount: 2, autoHandoff: true});
    expect(store.execute.mock.calls).toEqual([[1, ['evidence-0']]]);
});
