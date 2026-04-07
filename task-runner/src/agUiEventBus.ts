// SPDX-License-Identifier: AGPL-3.0-or-later
// AG-UI Event Bus — in-process pub/sub for AG-UI protocol events.
// The executor publishes events; the SSE endpoint subscribes per task.
// Rich interactions: executor can request user input and wait for a response.

import { EventEmitter } from 'events';
import type { InteractionResponse } from './types';

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
    // ─── Rich Interaction Events ─────────────────────────────────────────
    INTERACTION_REQUEST = 'INTERACTION_REQUEST',
    INTERACTION_RESPONSE = 'INTERACTION_RESPONSE',
    INTERACTION_TIMEOUT = 'INTERACTION_TIMEOUT',
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
                this.emitter.removeAllListeners(`agui-response:${taskId}`);
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

    // ─── Rich Interaction Support ───────────────────────────────────────

    /**
     * Wait for a user response to an interaction request.
     * Returns a Promise that resolves with the response payload, or rejects on timeout.
     *
     * @param taskId The task ID
     * @param interactionId Unique ID for this interaction
     * @param timeoutMs Maximum time to wait (default 5 minutes)
     */
    waitForResponse(
        taskId: string,
        interactionId: string,
        timeoutMs = 300_000,
    ): Promise<InteractionResponse> {
        return new Promise<InteractionResponse>((resolve, reject) => {
            const channel = `agui-response:${taskId}`;
            let timer: ReturnType<typeof setTimeout> | null = null;

            const handler = (response: InteractionResponse) => {
                if (response.interactionId !== interactionId) return;

                // Matching response received — clean up and resolve
                if (timer) clearTimeout(timer);
                this.emitter.removeListener(channel, handler);
                resolve(response);
            };

            this.emitter.on(channel, handler);

            // Timeout — emit INTERACTION_TIMEOUT and reject
            timer = setTimeout(() => {
                this.emitter.removeListener(channel, handler);

                // Emit timeout event to SSE subscribers
                this.emit(taskId, {
                    type: AgUiEventType.INTERACTION_TIMEOUT,
                    timestamp: Date.now(),
                    threadId: taskId,
                    interactionId,
                });

                reject(new Error(`Interaction ${interactionId} timed out after ${timeoutMs}ms`));
            }, timeoutMs);
        });
    }

    /**
     * Submit a response to an interaction request.
     * Called by the /respond endpoint when a user submits their input.
     *
     * @param taskId The task ID
     * @param response The user's response payload
     */
    respond(taskId: string, response: InteractionResponse): void {
        // Emit to the waiting executor
        this.emitter.emit(`agui-response:${taskId}`, response);

        // Also emit as an AG-UI event for SSE subscribers (so the frontend knows the interaction was answered)
        this.emit(taskId, {
            type: AgUiEventType.INTERACTION_RESPONSE,
            timestamp: Date.now(),
            threadId: taskId,
            interactionId: response.interactionId,
            approved: response.approved,
            data: response.data,
            selectedOptionId: response.selectedOptionId,
        });
    }
}

// ─── Singleton Instance ─────────────────────────────────────────────────────

export const agUiEventBus = new AgUiEventBus();
