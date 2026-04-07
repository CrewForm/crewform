// SPDX-License-Identifier: AGPL-3.0-or-later
// AG-UI Interaction Helper — allows executors to request user input and pause execution.

import { randomUUID } from 'crypto';
import { supabase } from './supabase';
import { agUiEventBus, AgUiEventType } from './agUiEventBus';
import type { InteractionContext, InteractionResponse, InteractionType, InteractionChoice } from './types';

/** Default timeout: 5 minutes */
const DEFAULT_TIMEOUT_MS = 300_000;

/**
 * Request user interaction during agent execution.
 *
 * This function:
 * 1. Emits an INTERACTION_REQUEST event via AG-UI SSE
 * 2. Updates the task status to 'waiting_for_input' with context
 * 3. Blocks execution until the user responds or timeout occurs
 * 4. Returns the user's response
 *
 * @param taskId The task ID (threadId in AG-UI)
 * @param type The interaction type: 'approval', 'confirm_data', or 'choice'
 * @param options Configuration for the interaction prompt
 * @returns The user's response
 * @throws Error if the interaction times out
 */
export async function requestUserInteraction(
    taskId: string,
    type: InteractionType,
    options: {
        title: string;
        description?: string;
        data?: Record<string, unknown>;
        choices?: InteractionChoice[];
        timeoutMs?: number;
    },
): Promise<InteractionResponse> {
    const interactionId = randomUUID();
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const context: InteractionContext = {
        interactionId,
        type,
        title: options.title,
        description: options.description,
        data: options.data,
        choices: options.choices,
        requestedAt: Date.now(),
        timeoutMs,
    };

    // 1. Update task status to waiting_for_input with interaction context
    await supabase
        .from('tasks')
        .update({
            status: 'waiting_for_input',
            interaction_context: context,
        })
        .eq('id', taskId);

    // 2. Emit INTERACTION_REQUEST event to SSE subscribers
    agUiEventBus.emit(taskId, {
        type: AgUiEventType.INTERACTION_REQUEST,
        timestamp: Date.now(),
        threadId: taskId,
        interactionId,
        interactionType: type,
        title: options.title,
        description: options.description,
        data: options.data,
        choices: options.choices,
        timeoutMs,
    });

    // 3. Block until response or timeout
    try {
        const response = await agUiEventBus.waitForResponse(taskId, interactionId, timeoutMs);

        // 4. Clear interaction context (status already reset by /respond endpoint)
        await supabase
            .from('tasks')
            .update({
                status: 'running',
                interaction_context: null,
            })
            .eq('id', taskId);

        return response;
    } catch (err) {
        // Timeout — mark task as failed
        await supabase
            .from('tasks')
            .update({
                status: 'failed',
                error: `User interaction timed out: ${options.title}`,
                interaction_context: null,
            })
            .eq('id', taskId);

        throw err;
    }
}

// ─── Convenience Helpers ────────────────────────────────────────────────────

/**
 * Request approval from the user before proceeding.
 * Returns true if approved, false if rejected.
 */
export async function requestApproval(
    taskId: string,
    title: string,
    description?: string,
    timeoutMs?: number,
): Promise<boolean> {
    const response = await requestUserInteraction(taskId, 'approval', {
        title,
        description,
        timeoutMs,
    });
    return response.approved === true;
}

/**
 * Ask the user to confirm or edit data before proceeding.
 * Returns the (possibly modified) data.
 */
export async function requestDataConfirmation(
    taskId: string,
    title: string,
    data: Record<string, unknown>,
    description?: string,
    timeoutMs?: number,
): Promise<Record<string, unknown>> {
    const response = await requestUserInteraction(taskId, 'confirm_data', {
        title,
        description,
        data,
        timeoutMs,
    });

    // If the user approved without changes, return original data
    if (response.approved && !response.data) return data;
    // If the user provided modified data, return that
    if (response.data) return response.data;
    // If rejected, throw so the executor can handle it
    if (!response.approved) throw new Error('User rejected data confirmation');
    return data;
}

/**
 * Present a choice to the user and wait for their selection.
 * Returns the selected option ID.
 */
export async function requestChoice(
    taskId: string,
    title: string,
    choices: InteractionChoice[],
    description?: string,
    timeoutMs?: number,
): Promise<string> {
    const response = await requestUserInteraction(taskId, 'choice', {
        title,
        description,
        choices,
        timeoutMs,
    });

    if (!response.selectedOptionId) {
        throw new Error('No option selected');
    }

    return response.selectedOptionId;
}
