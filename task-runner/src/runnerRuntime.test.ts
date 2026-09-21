// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import type { IncomingMessage, ServerResponse } from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
    healthy: true,
    tasks: [] as Array<{ id: string }>,
    finish: [] as Array<() => void>,
    httpHandler: undefined as ((req: IncomingMessage, res: ServerResponse) => void) | undefined,
    processTask: vi.fn(),
    a2a: vi.fn(),
    release: vi.fn(),
}));

vi.mock('http', () => ({ default: {
    createServer: (handler: typeof state.httpHandler) => {
        state.httpHandler = handler;
        return { listen: (_port: number, _host: string, ready: () => void) => ready(), close: vi.fn() };
    },
} }));
vi.mock('./supabase', () => ({ supabase: {
    rpc: async (name: string) => ({
        data: name === 'claim_next_task' && state.tasks.length ? [state.tasks.shift()] : [], error: null,
    }),
    channel: () => {
        const channel = { on: () => channel, subscribe: () => channel };
        return channel;
    },
} }));
vi.mock('./executor', () => ({ processTask: state.processTask }));
vi.mock('./pipelineExecutor', () => ({ processPipelineRun: vi.fn() }));
vi.mock('./orchestratorExecutor', () => ({ processOrchestratorRun: vi.fn() }));
vi.mock('./collaborationExecutor', () => ({ processCollaborationRun: vi.fn() }));
vi.mock('./auditWriter', () => ({ writeTeamRunAudit: vi.fn() }));
vi.mock('./license', () => ({ isFeatureEnabled: vi.fn(), validateLicensesOnStartup: async () => {} }));
vi.mock('./a2aServer', () => ({ handleA2ARequest: state.a2a }));
vi.mock('./agUiServer', () => ({ handleAgUiRequest: async () => false }));
vi.mock('./mcpServer', () => ({ handleMcpServerRequest: async () => false }));
vi.mock('./chatServer', () => ({ handleChatRequest: async () => false }));
vi.mock('./kbSearchEndpoint', () => ({ handleKbSearchRequest: async () => false }));
vi.mock('./runnerRegistry', () => ({
    registerRunner: async () => 'runner-test', deregisterRunner: vi.fn(),
    getRunnerId: () => 'runner-test', getInstanceName: () => 'test',
    runRecoverySweep: async () => 0, RECOVERY_INTERVAL_MS: 30_000,
    MAX_CONCURRENT: 2, decrementLoad: state.release, isRunnerHealthy: () => state.healthy,
}));
vi.mock('./triggerScheduler', () => ({ evaluateTriggers: async () => {}, TRIGGER_EVAL_INTERVAL_MS: 60_000 }));
vi.mock('./tracing', () => ({ initTracing: async () => {}, isTracingEnabled: () => false }));

const listeners = new Map<'SIGINT' | 'SIGTERM', Set<unknown>>();
async function flush() {
    // Drain asynchronous startup, claim, and completion continuations without
    // advancing the fallback timer (which used to hide delayed queue pickup).
    for (let i = 0; i < 40; i++) await Promise.resolve();
}

beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.stubEnv('TRIGGER_SCHEDULER_ENABLED', 'false');
    state.healthy = true;
    state.tasks = [];
    state.finish = [];
    state.httpHandler = undefined;
    state.a2a.mockResolvedValue(false);
    state.release.mockResolvedValue(undefined);
    state.processTask.mockImplementation(() => new Promise<void>(resolve => state.finish.push(resolve)));
    for (const signal of ['SIGINT', 'SIGTERM'] as const) listeners.set(signal, new Set(process.listeners(signal)));
});

afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
        for (const listener of process.listeners(signal)) {
            if (!listeners.get(signal)?.has(listener)) process.removeListener(signal, listener);
        }
    }
    delete (globalThis as Record<string, unknown>).__realtimeChannel;
});

describe('runner runtime', () => {
    it('fills capacity and starts queued work on completion without waiting for the polling timer', async () => {
        state.tasks = [{ id: 'first' }, { id: 'second' }, { id: 'third' }];
        await import('./index');
        await flush();
        expect(state.processTask).toHaveBeenCalledTimes(2);
        state.finish[0]();
        await flush();
        expect(state.release).toHaveBeenCalledTimes(1);
        expect(state.processTask).toHaveBeenCalledTimes(3);
        expect(state.processTask).toHaveBeenLastCalledWith({ id: 'third' });
    });

    it('reports 503 when registration is unhealthy even though the HTTP process is alive', async () => {
        await import('./index');
        await flush();
        state.healthy = false;
        const res = { writeHead: vi.fn(), end: vi.fn() };
        state.httpHandler!({ method: 'GET', url: '/health' } as IncomingMessage, res as unknown as ServerResponse);
        await flush();
        expect(res.writeHead).toHaveBeenCalledWith(503, { 'Content-Type': 'application/json' });
        expect(JSON.parse(res.end.mock.calls[0][0]).status).toBe('unavailable');
    });

    it('turns a rejected protocol handler into an HTTP error instead of an unhandled rejection', async () => {
        await import('./index');
        await flush();
        state.a2a.mockRejectedValueOnce(new Error('upstream unavailable'));
        const res = { writeHead: vi.fn(), end: vi.fn(), headersSent: false };
        state.httpHandler!({ method: 'GET', url: '/a2a/test' } as IncomingMessage, res as unknown as ServerResponse);
        await flush();
        expect(res.writeHead).toHaveBeenCalledWith(500, { 'Content-Type': 'application/json' });
    });
});
