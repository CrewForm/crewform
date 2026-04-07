// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useState, useEffect, useRef, useCallback } from 'react'

// ─── AG-UI Event Types ──────────────────────────────────────────────────────

export type AgUiEventType =
    | 'RUN_STARTED'
    | 'RUN_FINISHED'
    | 'RUN_ERROR'
    | 'STEP_STARTED'
    | 'STEP_FINISHED'
    | 'TEXT_MESSAGE_START'
    | 'TEXT_MESSAGE_CONTENT'
    | 'TEXT_MESSAGE_END'
    | 'TOOL_CALL_START'
    | 'TOOL_CALL_ARGS'
    | 'TOOL_CALL_END'
    | 'STATE_SNAPSHOT'
    | 'STATE_DELTA'
    | 'CUSTOM'
    | 'INTERACTION_REQUEST'
    | 'INTERACTION_RESPONSE'
    | 'INTERACTION_TIMEOUT'

export interface AgUiEvent {
    type: AgUiEventType
    timestamp: number
    threadId?: string
    runId?: string
    messageId?: string
    toolCallId?: string
    toolCallName?: string
    delta?: string
    result?: string
    message?: string
    role?: string
    [key: string]: unknown
}

export type AgUiStreamStatus = 'idle' | 'connecting' | 'streaming' | 'completed' | 'error'

export interface AgUiToolCall {
    id: string
    name: string
    args: string
    result?: string
    status: 'calling' | 'done'
}

export interface AgUiInteractionRequest {
    interactionId: string
    interactionType: 'approval' | 'confirm_data' | 'choice'
    title: string
    description?: string
    data?: Record<string, unknown>
    choices?: { id: string; label: string; description?: string }[]
    timeoutMs: number
    requestedAt: number
}

export interface AgUiStreamState {
    status: AgUiStreamStatus
    events: AgUiEvent[]
    textContent: string
    toolCalls: AgUiToolCall[]
    pendingInteraction: AgUiInteractionRequest | null
    error: string | null
}

// ─── Hook ───────────────────────────────────────────────────────────────────

/**
 * React hook that connects to the AG-UI SSE endpoint and streams events.
 *
 * @param taskRunnerUrl The URL of the task runner (e.g. http://localhost:3001)
 * @param agentId The agent ID to stream
 * @param taskId The task ID (threadId in AG-UI)
 * @param apiKey Bearer token for auth
 * @param enabled Whether to start streaming (default: false)
 */
export function useAgentStream(
    taskRunnerUrl: string,
    agentId: string,
    taskId: string,
    apiKey: string,
    enabled = false,
): AgUiStreamState & { respond: (response: { interactionId: string; approved?: boolean; data?: Record<string, unknown>; selectedOptionId?: string }) => Promise<void> } {
    const [state, setState] = useState<AgUiStreamState>({
        status: 'idle',
        events: [],
        textContent: '',
        toolCalls: [],
        pendingInteraction: null,
        error: null,
    })
    const abortRef = useRef<AbortController | null>(null)

    const connect = useCallback(async () => {
        if (!enabled || !taskId || !agentId) return

        // Abort any existing connection
        abortRef.current?.abort()
        const controller = new AbortController()
        abortRef.current = controller

        setState(prev => ({ ...prev, status: 'connecting', error: null }))

        try {
            const url = `${taskRunnerUrl.replace(/\/$/, '')}/ag-ui/${agentId}/sse`
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    threadId: taskId,
                    runId: taskId,
                }),
                signal: controller.signal,
            })

            if (!response.ok) {
                throw new Error(`AG-UI SSE failed: ${response.status.toString()}`)
            }

            if (!response.body) {
                throw new Error('No response body')
            }

            setState(prev => ({ ...prev, status: 'streaming' }))

            const reader = response.body.getReader()
            const decoder = new TextDecoder()
            let buffer = ''

            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            while (true) {
                const { done, value } = await reader.read()
                if (done) break

                buffer += decoder.decode(value, { stream: true })

                // Parse SSE events from buffer
                const lines = buffer.split('\n')
                buffer = lines.pop() ?? '' // Keep incomplete line in buffer

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const event = JSON.parse(line.slice(6)) as AgUiEvent

                            setState(prev => {
                                const newEvents = [...prev.events, event]
                                let newText = prev.textContent
                                let newToolCalls = [...prev.toolCalls]
                                let newStatus: AgUiStreamStatus = prev.status
                                let newError = prev.error

                                switch (event.type) {
                                    case 'TEXT_MESSAGE_CONTENT':
                                        if (event.delta) newText += event.delta
                                        break

                                    case 'TOOL_CALL_START':
                                        if (event.toolCallId) {
                                            newToolCalls.push({
                                                id: event.toolCallId,
                                                name: event.toolCallName ?? 'unknown',
                                                args: '',
                                                status: 'calling',
                                            })
                                        }
                                        break

                                    case 'TOOL_CALL_ARGS':
                                        if (event.toolCallId && event.delta) {
                                            newToolCalls = newToolCalls.map(tc =>
                                                tc.id === event.toolCallId
                                                    ? { ...tc, args: tc.args + (event.delta ?? '') }
                                                    : tc,
                                            )
                                        }
                                        break

                                    case 'TOOL_CALL_END':
                                        if (event.toolCallId) {
                                            newToolCalls = newToolCalls.map(tc =>
                                                tc.id === event.toolCallId
                                                    ? { ...tc, status: 'done' as const, result: event.result ?? '' }
                                                    : tc,
                                            )
                                        }
                                        break

                                    case 'RUN_FINISHED':
                                        newStatus = 'completed'
                                        break

                                    case 'RUN_ERROR':
                                        newStatus = 'error'
                                        newError = event.message ?? 'Unknown error'
                                        break

                                    case 'INTERACTION_REQUEST':
                                        return {
                                            ...prev,
                                            events: newEvents,
                                            pendingInteraction: {
                                                interactionId: event.interactionId as string,
                                                interactionType: event.interactionType as 'approval' | 'confirm_data' | 'choice',
                                                title: event.title as string,
                                                description: event.description as string | undefined,
                                                data: event.data as Record<string, unknown> | undefined,
                                                choices: event.choices as { id: string; label: string; description?: string }[] | undefined,
                                                timeoutMs: event.timeoutMs as number,
                                                requestedAt: event.timestamp,
                                            },
                                        }

                                    case 'INTERACTION_RESPONSE':
                                    case 'INTERACTION_TIMEOUT':
                                        return {
                                            ...prev,
                                            events: newEvents,
                                            pendingInteraction: null,
                                        }
                                }

                                return {
                                    status: newStatus,
                                    events: newEvents,
                                    textContent: newText,
                                    toolCalls: newToolCalls,
                                    pendingInteraction: prev.pendingInteraction,
                                    error: newError,
                                }
                            })
                        } catch {
                            // Ignore malformed SSE data
                        }
                    }
                }
            }
        } catch (err: unknown) {
            if (err instanceof DOMException && err.name === 'AbortError') return // Intentional abort
            setState(prev => ({
                ...prev,
                status: 'error',
                error: err instanceof Error ? err.message : 'Connection failed',
            }))
        }
    }, [taskRunnerUrl, agentId, taskId, apiKey, enabled])

    useEffect(() => {
        void connect()
        return () => { abortRef.current?.abort() }
    }, [connect])

    // ─── Respond to interactions ────────────────────────────────────────

    const respond = useCallback(async (response: {
        interactionId: string
        approved?: boolean
        data?: Record<string, unknown>
        selectedOptionId?: string
    }) => {
        const url = `${taskRunnerUrl.replace(/\/$/, '')}/ag-ui/${agentId}/respond`
        await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                threadId: taskId,
                ...response,
            }),
        })
    }, [taskRunnerUrl, agentId, taskId, apiKey])

    return { ...state, respond }
}
