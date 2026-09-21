// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock('./supabase', () => ({ supabase: db }));

let registry: typeof import('./runnerRegistry');
let chain: Record<string, ReturnType<typeof vi.fn>>;

beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.clearAllMocks();
    chain = {};
    for (const name of ['insert', 'update', 'eq', 'select']) chain[name] = vi.fn(() => chain);
    chain.single = vi.fn().mockResolvedValue({ data: { id: 'runner-1' }, error: null });
    chain.maybeSingle = vi.fn().mockResolvedValue({ data: { id: 'runner-1' }, error: null });
    db.from.mockReturnValue(chain);
    db.rpc.mockResolvedValue({ data: 0, error: null });
    registry = await import('./runnerRegistry');
});

afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
});

describe('runner registration and recovery', () => {
    it('is not ready until registered, and becomes unhealthy after missed heartbeats', async () => {
        expect(registry.isRunnerHealthy()).toBe(false);
        await registry.registerRunner(vi.fn());
        expect(registry.isRunnerHealthy()).toBe(true);
        vi.setSystemTime(Date.now() + 60_001);
        expect(registry.isRunnerHealthy()).toBe(false);
        await registry.sendHeartbeat();
        expect(registry.isRunnerHealthy()).toBe(true);
    });

    it('detects a deleted registration instead of silently updating zero rows forever', async () => {
        const lost = vi.fn();
        await registry.registerRunner(lost);
        chain.maybeSingle.mockResolvedValue({ data: null, error: null });
        await registry.sendHeartbeat();
        expect(lost).toHaveBeenCalledTimes(1);
        expect(registry.isRunnerHealthy()).toBe(false);
        expect(chain.eq).toHaveBeenCalledWith('status', 'active');
        await registry.sendHeartbeat();
        expect(lost).toHaveBeenCalledTimes(1);
    });

    it('does not treat a transient database error as proof of a lost lease', async () => {
        const lost = vi.fn();
        await registry.registerRunner(lost);
        chain.maybeSingle.mockResolvedValue({ data: null, error: { message: 'network error' } });
        await registry.sendHeartbeat();
        expect(lost).not.toHaveBeenCalled();
        vi.setSystemTime(Date.now() + 60_001);
        expect(registry.isRunnerHealthy()).toBe(false);
    });

    it('recovers already-dead runners even when no new runner was marked stale', async () => {
        db.rpc.mockResolvedValueOnce({ data: 0, error: null })
            .mockResolvedValueOnce({ data: 2, error: null });
        expect(await registry.runRecoverySweep()).toBe(2);
        expect(db.rpc).toHaveBeenNthCalledWith(1, 'mark_stale_runners', { stale_threshold: '2 minutes' });
        expect(db.rpc).toHaveBeenNthCalledWith(2, 'recover_stale_tasks');
    });

    it('retries recovery on the next sweep after the first recovery request fails', async () => {
        db.rpc.mockResolvedValueOnce({ data: 1, error: null })
            .mockResolvedValueOnce({ data: null, error: { message: 'temporary failure' } })
            .mockResolvedValueOnce({ data: 0, error: null })
            .mockResolvedValueOnce({ data: 1, error: null });
        expect(await registry.runRecoverySweep()).toBe(0);
        expect(await registry.runRecoverySweep()).toBe(1);
    });

    it('preserves runner ownership on shutdown so unfinished tasks remain recoverable', async () => {
        await registry.registerRunner(vi.fn());
        await registry.deregisterRunner();
        expect(chain.update).toHaveBeenCalledWith({ status: 'dead' });
        expect(registry.getRunnerId()).toBeNull();
        expect(registry.isRunnerHealthy()).toBe(false);
    });

    it('does not overlap heartbeat requests', async () => {
        await registry.registerRunner(vi.fn());
        let complete!: (value: unknown) => void;
        chain.maybeSingle.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
        const first = registry.sendHeartbeat();
        await registry.sendHeartbeat();
        expect(chain.maybeSingle).toHaveBeenCalledTimes(1);
        complete({ data: { id: 'runner-1' }, error: null });
        await first;
    });
});
