// SPDX-License-Identifier: MIT
import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    taskId: 'ag-ui-disconnect-test',
    update: vi.fn(),
}));

vi.mock('./httpInput', () => ({
    readBody: async () => '{}',
    boundedJson: () => ({ threadId: mocks.taskId }),
    HttpInputError: class HttpInputError extends Error {},
}));

vi.mock('./supabase', () => ({
    supabase: {
        from: (table: string) => {
            const query = {
                select: () => query,
                eq: () => query,
                update: (...args: unknown[]) => { mocks.update(table, ...args); return query; },
                single: async () => ({
                    data: table === 'api_keys'
                        ? { workspace_id: 'workspace-test' }
                        : table === 'agents'
                            ? { id: 'agent-test', name: 'Test Agent' }
                            : { id: mocks.taskId, status: 'running' },
                }),
            };
            return query;
        },
    },
}));

vi.mock('./crypto', () => ({ hashApiKey: () => 'hashed-test-token' }));

import { agUiEventBus, AgUiEventType } from './agUiEventBus';
import { handleAgUiRequest } from './agUiServer';

const event = (type: AgUiEventType, extra = {}) => ({ type, timestamp: Date.now(), ...extra });

function createRequest() {
    const req = new EventEmitter() as EventEmitter & Partial<IncomingMessage>;
    req.method = 'POST';
    req.url = '/ag-ui/agent-test/sse';
    req.headers = { authorization: 'Bearer test-token' };
    return req as IncomingMessage & EventEmitter;
}

function createResponse() {
    const res = new EventEmitter() as EventEmitter & Partial<ServerResponse>;
    res.writeHead = vi.fn();
    res.write = vi.fn();
    res.end = vi.fn();
    return res as ServerResponse & EventEmitter & { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
}

async function flushMicrotasks() {
    for (let i = 0; i < 20; i++) await Promise.resolve();
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.taskId = 'ag-ui-disconnect-test';
});

afterEach(() => {
    if (agUiEventBus.hasSubscribers(mocks.taskId)) {
        agUiEventBus.emit(mocks.taskId, event(AgUiEventType.RUN_ERROR));
    }
    vi.clearAllTimers();
    vi.useRealTimers();
});

describe('AG-UI SSE disconnect lifecycle', () => {
    it('streams a normal run through RUN_FINISHED and closes the response', async () => {
        const req = createRequest();
        const res = createResponse();
        const handled = handleAgUiRequest(req, res);
        await vi.waitFor(() => expect(agUiEventBus.hasSubscribers(mocks.taskId)).toBe(true));

        agUiEventBus.emit(mocks.taskId, event(AgUiEventType.RUN_STARTED));
        agUiEventBus.emit(mocks.taskId, event(AgUiEventType.TEXT_MESSAGE_CONTENT, { delta: 'hello' }));
        agUiEventBus.emit(mocks.taskId, event(AgUiEventType.RUN_FINISHED));

        await expect(handled).resolves.toBe(true);
        const events = res.write.mock.calls
            .map(([chunk]) => String(chunk))
            .filter((frame: string) => frame.startsWith('data: '))
            .map((frame: string) => JSON.parse(frame.slice(6).trim()).type);
        expect(events).toEqual([
            AgUiEventType.RUN_STARTED,
            AgUiEventType.TEXT_MESSAGE_CONTENT,
            AgUiEventType.RUN_FINISHED,
        ]);
        expect(res.end).toHaveBeenCalledOnce();
        expect(mocks.update).not.toHaveBeenCalled();
    });

    it('ends a disconnected stream and removes its subscriber without another event', async () => {
        const req = createRequest();
        const res = createResponse();
        let finishExecution!: () => void;
        let executionFinished = false;
        const execution = vi.fn(() => new Promise<void>(resolve => {
            finishExecution = () => { executionFinished = true; resolve(); };
        }));
        const executionPromise = execution();
        const handled = handleAgUiRequest(req, res);
        await vi.waitFor(() => expect(agUiEventBus.hasSubscribers(mocks.taskId)).toBe(true));

        agUiEventBus.emit(mocks.taskId, event(AgUiEventType.RUN_STARTED));
        agUiEventBus.emit(mocks.taskId, event(AgUiEventType.TEXT_MESSAGE_CONTENT, { delta: 'partial' }));
        await vi.waitFor(() => expect(res.write).toHaveBeenCalledTimes(3));

        res.emit('close');
        await flushMicrotasks();
        const outcome = await Promise.race([
            handled.then(() => 'settled'),
            vi.advanceTimersByTimeAsync(25).then(() => 'still-waiting'),
        ]);

        expect(outcome).toBe('settled');
        expect(agUiEventBus.hasSubscribers(mocks.taskId)).toBe(false);
        expect(res.end).toHaveBeenCalledOnce();
        const streamedTypes = res.write.mock.calls
            .map(([chunk]) => String(chunk))
            .filter((frame: string) => frame.startsWith('data: '))
            .map((frame: string) => JSON.parse(frame.slice(6).trim()).type);
        expect(streamedTypes).toEqual([AgUiEventType.RUN_STARTED, AgUiEventType.TEXT_MESSAGE_CONTENT]);
        expect(execution).toHaveBeenCalledOnce();
        expect(executionFinished).toBe(false);
        expect(mocks.update).not.toHaveBeenCalled();
        finishExecution();
        await executionPromise;
    });

    it('resolves a pending iterator next when its consumer returns', async () => {
        const iterator = agUiEventBus.subscribe(mocks.taskId)[Symbol.asyncIterator]();
        const pending = iterator.next();

        await iterator.return?.();

        await expect(pending).resolves.toMatchObject({ done: true });
        expect(agUiEventBus.hasSubscribers(mocks.taskId)).toBe(false);
    });
});
