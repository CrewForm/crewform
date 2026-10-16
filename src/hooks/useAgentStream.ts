// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { useState, useEffect, useRef, useCallback } from 'react'
import { z } from 'zod'
import { consumeSse } from '@/lib/sse'

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
    | 'WIZARD_STEP_ADVANCE'
    | 'WIZARD_COMPLETE'
    | 'WIZARD_CANCELLED'

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

export type AgUiStreamStatus = 'idle' | 'connecting' | 'streaming' | 'completed' | 'error' | 'interrupted'

export interface AgUiToolCall {
    id: string
    name: string
    args: string
    result?: string
    status: 'calling' | 'done'
}

export interface AgUiWizardField {
    key: string
    label: string
    type: 'text' | 'number' | 'email' | 'textarea' | 'select' | 'toggle'
    required?: boolean
    options?: { value: string; label: string }[]
    placeholder?: string
    defaultValue?: unknown
}

export interface AgUiWizardCondition {
    dependsOnStep: string
    field: string
    operator: 'equals' | 'not_equals' | 'contains'
    value: unknown
}

export interface AgUiWizardStep {
    stepId: string
    type: 'approval' | 'confirm_data' | 'choice' | 'text_input' | 'form'
    title: string
    description?: string
    data?: Record<string, unknown>
    choices?: { id: string; label: string; description?: string }[]
    fields?: AgUiWizardField[]
    placeholder?: string
    condition?: AgUiWizardCondition
}

export interface AgUiWizardDefinition {
    steps: AgUiWizardStep[]
    title: string
    description?: string
}

export interface AgUiWizardStepResponse {
    stepId: string
    approved?: boolean
    data?: Record<string, unknown>
    selectedOptionId?: string
    textInput?: string
}

export interface AgUiInteractionRequest {
    interactionId: string
    interactionType: 'approval' | 'confirm_data' | 'choice' | 'wizard'
    title: string
    description?: string
    data?: Record<string, unknown>
    choices?: { id: string; label: string; description?: string }[]
    timeoutMs: number
    requestedAt: number
    wizard?: AgUiWizardDefinition
}

export interface AgUiWizardState {
    steps: AgUiWizardStep[]
    currentStepIndex: number
    completedStepIds: string[]
    responses: AgUiWizardStepResponse[]
}

export interface AgUiStreamState {
    status: AgUiStreamStatus
    events: AgUiEvent[]
    textContent: string
    toolCalls: AgUiToolCall[]
    pendingInteraction: AgUiInteractionRequest | null
    wizardState: AgUiWizardState | null
    error: string | null
}

const emptyState = (): AgUiStreamState => ({status: 'idle', events: [], textContent: '', toolCalls: [], pendingInteraction: null, wizardState: null, error: null})

// Validate fields consumed by the renderer. Unknown extension fields/events are
// retained for protocol compatibility; malformed known fields interrupt safely.
const eventSchema = z.object({
    type: z.string().min(1), timestamp: z.number().finite(),
    threadId: z.string().optional(), runId: z.string().optional(),
    delta: z.string().optional(), toolCallId: z.string().optional(),
    toolCallName: z.string().optional(), result: z.string().optional(), message: z.string().optional(),
    interactionId: z.string().optional(), interactionType: z.enum(['approval', 'confirm_data', 'choice', 'wizard']).optional(),
    title: z.string().optional(), description: z.string().optional(), timeoutMs: z.number().optional(),
    data: z.record(z.unknown()).optional(), choices: z.array(z.object({id: z.string(), label: z.string(), description: z.string().optional()})).optional(),
    completedStepIds: z.array(z.string()).optional(), nextStepId: z.string().optional(),
    wizard: z.object({title: z.string(), steps: z.array(z.object({stepId: z.string()}).passthrough())}).passthrough().optional(),
}).passthrough().superRefine((event, ctx) => {
    if (event.type === 'INTERACTION_REQUEST' && (!event.interactionId || !event.interactionType || !event.title || event.timeoutMs === undefined))
        ctx.addIssue({code: z.ZodIssueCode.custom, message: 'Incomplete interaction request'})
})

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
): AgUiStreamState & { respond: (response: { interactionId: string; approved?: boolean; data?: Record<string, unknown>; selectedOptionId?: string; wizardStepId?: string; wizardCancelled?: boolean }) => Promise<void> } {
    const [state, setState] = useState<AgUiStreamState>(emptyState)
    const abortRef = useRef<AbortController | null>(null)

    const connect = useCallback(async () => {
        if (!enabled || !taskId || !agentId) { setState(emptyState()); return }

        // Abort any existing connection
        abortRef.current?.abort()
        const controller = new AbortController()
        abortRef.current = controller

        setState({ ...emptyState(), status: 'connecting' })
        let connected = false
        let textSize = 0
        let argsSize = 0

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

            if (controller.signal.aborted || abortRef.current !== controller) {
                await response.body.cancel().catch(() => undefined)
                return
            }
            connected = true
            setState(prev => ({ ...prev, status: 'streaming' }))

            const terminal = await consumeSse(response.body, data => {
                const event = eventSchema.parse(JSON.parse(data)) as AgUiEvent
                if (event.threadId && event.threadId !== taskId) throw new Error('Stream task identity mismatch.')
                if (controller.signal.aborted || abortRef.current !== controller) return true
                if (event.type === 'TEXT_MESSAGE_CONTENT') textSize += event.delta?.length ?? 0
                if (event.type === 'TOOL_CALL_ARGS') argsSize += event.delta?.length ?? 0
                if (textSize > 1024 * 1024 || argsSize > 256 * 1024) throw new Error('Stream content exceeds the display limit. Inspect the saved run history.')
                setState(prev => {
                    if (controller.signal.aborted || abortRef.current !== controller) return prev
                    const newEvents = [...prev.events.slice(-499), event]
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
                                newToolCalls = newToolCalls.slice(-99)
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
                            newError = event.message ?? (typeof event.error === 'string' ? event.error : 'Execution failed')
                            break

                        case 'INTERACTION_REQUEST': {
                            const interaction: AgUiInteractionRequest = {
                                interactionId: event.interactionId as string,
                                interactionType: event.interactionType as 'approval' | 'confirm_data' | 'choice' | 'wizard',
                                title: event.title as string,
                                description: event.description as string | undefined,
                                data: event.data as Record<string, unknown> | undefined,
                                choices: event.choices as { id: string; label: string; description?: string }[] | undefined,
                                timeoutMs: event.timeoutMs as number,
                                requestedAt: event.timestamp,
                                wizard: event.wizard as AgUiWizardDefinition | undefined,
                            }
                            // Initialize wizard state if this is a wizard interaction
                            const newWizardState: AgUiWizardState | null = interaction.interactionType === 'wizard' && interaction.wizard
                                ? {
                                    steps: interaction.wizard.steps,
                                    currentStepIndex: 0,
                                    completedStepIds: [],
                                    responses: [],
                                }
                                : null
                            return {
                                ...prev,
                                events: newEvents,
                                pendingInteraction: interaction,
                                wizardState: newWizardState,
                            }
                        }

                        case 'WIZARD_STEP_ADVANCE':
                            return {
                                ...prev,
                                events: newEvents,
                                wizardState: prev.wizardState ? {
                                    ...prev.wizardState,
                                    completedStepIds: event.completedStepIds as string[],
                                    currentStepIndex: prev.wizardState.steps.findIndex(
                                        s => s.stepId === (event.nextStepId as string)
                                    ),
                                } : null,
                            }

                        case 'WIZARD_COMPLETE':
                            return {
                                ...prev,
                                events: newEvents,
                                pendingInteraction: null,
                                wizardState: null,
                            }

                        case 'WIZARD_CANCELLED':
                            return {
                                ...prev,
                                events: newEvents,
                                pendingInteraction: null,
                                wizardState: null,
                            }

                        case 'INTERACTION_RESPONSE':
                        case 'INTERACTION_TIMEOUT':
                            return {
                                ...prev,
                                events: newEvents,
                                pendingInteraction: null,
                                wizardState: null,
                            }
                    }

                    return {
                        status: newStatus,
                        events: newEvents,
                        textContent: newText,
                        wizardState: newStatus === 'completed' || newStatus === 'error' ? null : prev.wizardState,
                        toolCalls: newToolCalls,
                        pendingInteraction: newStatus === 'completed' || newStatus === 'error' ? null : prev.pendingInteraction,
                        error: newError,
                    }
                })
                return event.type === 'RUN_FINISHED' || event.type === 'RUN_ERROR'
            }, controller.signal)
            if (!terminal) throw new Error('Stream interrupted before a final result. Execution may still be running; check saved run history before retrying.')
        } catch (err: unknown) {
            if (controller.signal.aborted || abortRef.current !== controller) return
            setState(prev => controller.signal.aborted || abortRef.current !== controller ? prev : ({
                ...prev,
                status: connected ? 'interrupted' : 'error',
                error: connected ? 'Live stream interrupted. Execution may still be running. Check saved run history before retrying.' : (err instanceof Error ? err.message : 'Connection failed'),
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
        wizardStepId?: string
        wizardCancelled?: boolean
    }) => {
        const url = `${taskRunnerUrl.replace(/\/$/, '')}/ag-ui/${agentId}/respond`
        const result = await fetch(url, {
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
        if (!result.ok) throw new Error(`Response was not accepted (${result.status.toString()}). Check the saved interaction before retrying.`)
    }, [taskRunnerUrl, agentId, taskId, apiKey])

    return { ...state, respond }
}
