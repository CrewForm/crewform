// SPDX-License-Identifier: MIT
import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    taskId: 'ag-ui-disconnect-test',
    taskLookup: null as Promise<{ data: { id: string; status: string } }> | null,
    taskLookupStarted: vi.fn(),
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
                single: () => {
                    if (table === 'tasks') {
                        mocks.taskLookupStarted();
                        return mocks.taskLookup ?? Promise.resolve({ data: { id: mocks.taskId, status: 'running' } });
                    }
                    return Promise.resolve({
                        data: table === 'api_keys'
                            ? { workspace_id: 'workspace-test' }
                            : { id: 'agent-test', name: 'Test Agent' },
                    });
                },
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
    res.destroyed = false;
    return res as ServerResponse & EventEmitter & { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
}

async function flushMicrotasks() {
    for (let i = 0; i < 20; i++) await Promise.resolve();
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.taskId = 'ag-ui-disconnect-test';
    mocks.taskLookup = null;
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
        const handled = handleAgUiRequest(req, res);
        await vi.waitFor(() => expect(agUiEventBus.hasSubscribers(mocks.taskId)).toBe(true));

        let finishProducer!: () => void;
        let producerFinished = false;
        const producer = (async () => {
            agUiEventBus.emit(mocks.taskId, event(AgUiEventType.RUN_STARTED));
            agUiEventBus.emit(mocks.taskId, event(AgUiEventType.TEXT_MESSAGE_CONTENT, { delta: 'partial' }));
            await new Promise<void>(resolve => { finishProducer = resolve; });
            producerFinished = true;
            agUiEventBus.emit(mocks.taskId, event(AgUiEventType.RUN_FINISHED));
        })();
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
        expect(producerFinished).toBe(false);
        expect(mocks.update).not.toHaveBeenCalled();
        const writesAfterDisconnect = res.write.mock.calls.length;
        finishProducer();
        await producer;
        expect(res.write).toHaveBeenCalledTimes(writesAfterDisconnect);
        expect(res.end).toHaveBeenCalledOnce();
        expect(mocks.update).not.toHaveBeenCalled();
    });

    it('does not subscribe when the response closes during task lookup', async () => {
        let finishTaskLookup!: (value: { data: { id: string; status: string } }) => void;
        mocks.taskLookup = new Promise(resolve => { finishTaskLookup = resolve; });
        const req = createRequest();
        const res = createResponse();
        const handled = handleAgUiRequest(req, res);

        await vi.waitFor(() => expect(mocks.taskLookupStarted).toHaveBeenCalledOnce());
        res.destroyed = true;
        res.emit('close');
        finishTaskLookup({ data: { id: mocks.taskId, status: 'running' } });

        await expect(handled).resolves.toBe(true);
        expect(agUiEventBus.hasSubscribers(mocks.taskId)).toBe(false);
        expect(res.writeHead).not.toHaveBeenCalled();
        expect(res.end).not.toHaveBeenCalled();
        expect(mocks.update).not.toHaveBeenCalled();
    });

    it('resolves a pending iterator next when its consumer returns', async () => {
        const iterator = agUiEventBus.subscribe(mocks.taskId)[Symbol.asyncIterator]();
        const pending = iterator.next();

        await iterator.return?.();

        await expect(pending).resolves.toMatchObject({ done: true });
        expect(agUiEventBus.hasSubscribers(mocks.taskId)).toBe(false);
    });
});
