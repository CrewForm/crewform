// SPDX-License-Identifier: AGPL-3.0-or-later
// AG-UI Event Bus — in-process pub/sub for AG-UI protocol events.
// The executor publishes events; the SSE endpoint subscribes per task.

import { EventEmitter } from 'events';

// ─── AG-UI Event Types ──────────────────────────────────────────────────────

export enum AgUiEventType {
    RUN_STARTED = 'RUN_STARTED',
    RUN_FINISHED = 'RUN_FINISHED',
    RUN_ERROR = 'RUN_ERROR',
    STEP_STARTED = 'STEP_STARTED',
    STEP_FINISHED = 'STEP_FINISHED',
    TEXT_MESSAGE_START = 'TEXT_MESSAGE_START',
    TEXT_MESSAGE_CONTENT = 'TEXT_MESSAGE_CONTENT',
    TEXT_MESSAGE_END = 'TEXT_MESSAGE_END',
    TOOL_CALL_START = 'TOOL_CALL_START',
    TOOL_CALL_ARGS = 'TOOL_CALL_ARGS',
    TOOL_CALL_END = 'TOOL_CALL_END',
    STATE_SNAPSHOT = 'STATE_SNAPSHOT',
    STATE_DELTA = 'STATE_DELTA',
    CUSTOM = 'CUSTOM',
}

export interface AgUiEvent {
    type: AgUiEventType;
    timestamp: number;
    threadId?: string;
    runId?: string;
    [key: string]: unknown;
}

// ─── Singleton Event Bus ────────────────────────────────────────────────────

class AgUiEventBus {
    private emitter = new EventEmitter();

    constructor() {
        // Allow many concurrent SSE listeners (one per active task)
        this.emitter.setMaxListeners(100);
    }

    /**
     * Publish an AG-UI event for a given task.
     * @param taskId The CrewForm task ID (used as threadId)
     * @param event The AG-UI event to emit
     */
    emit(taskId: string, event: AgUiEvent): void {
        this.emitter.emit(`agui:${taskId}`, event);

        // Auto-cleanup on terminal events
        if (
            event.type === AgUiEventType.RUN_FINISHED ||
            event.type === AgUiEventType.RUN_ERROR
        ) {
            // Give SSE clients a moment to receive the final event, then clean up
            setTimeout(() => {
                this.emitter.removeAllListeners(`agui:${taskId}`);
            }, 5000);
        }
    }

    /**
     * Subscribe to AG-UI events for a given task.
     * Returns an async iterable of events.
     */
    subscribe(taskId: string): AsyncIterable<AgUiEvent> {
        const emitter = this.emitter;
        const channel = `agui:${taskId}`;

        return {
            [Symbol.asyncIterator]() {
                const queue: AgUiEvent[] = [];
                let resolve: ((value: IteratorResult<AgUiEvent>) => void) | null = null;
                let done = false;

                const handler = (event: AgUiEvent) => {
                    if (resolve) {
                        const r = resolve;
                        resolve = null;
                        r({ value: event, done: false });
                    } else {
                        queue.push(event);
                    }

                    // Stop the iterator on terminal events
                    if (
                        event.type === AgUiEventType.RUN_FINISHED ||
                        event.type === AgUiEventType.RUN_ERROR
                    ) {
                        done = true;
                        emitter.removeListener(channel, handler);
                    }
                };

                emitter.on(channel, handler);

                return {
                    next(): Promise<IteratorResult<AgUiEvent>> {
                        if (queue.length > 0) {
                            const event = queue.shift()!;
                            return Promise.resolve({ value: event, done: false });
                        }
                        if (done) {
                            return Promise.resolve({ value: undefined as unknown as AgUiEvent, done: true });
                        }
                        return new Promise<IteratorResult<AgUiEvent>>((r) => {
                            resolve = r;
                        });
                    },
                    return(): Promise<IteratorResult<AgUiEvent>> {
                        done = true;
                        emitter.removeListener(channel, handler);
                        return Promise.resolve({ value: undefined as unknown as AgUiEvent, done: true });
                    },
                };
            },
        };
    }

    /** Check if there are active subscribers for a task */
    hasSubscribers(taskId: string): boolean {
        return this.emitter.listenerCount(`agui:${taskId}`) > 0;
    }
}

// ─── Singleton Instance ─────────────────────────────────────────────────────

export const agUiEventBus = new AgUiEventBus();
