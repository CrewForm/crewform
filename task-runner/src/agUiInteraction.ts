// SPDX-License-Identifier: AGPL-3.0-or-later
// AG-UI Interaction Helper — allows executors to request user input and pause execution.

import { randomUUID } from 'crypto';
import { supabase } from './supabase';
import { agUiEventBus, AgUiEventType } from './agUiEventBus';
import type { InteractionContext, InteractionResponse, InteractionType, InteractionChoice, WizardStep, WizardDefinition, WizardStepResponse, WizardResult, WizardCondition } from './types';

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
 * @param type The interaction type: 'approval', 'confirm_data', 'choice', or 'wizard'
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
        wizard?: WizardDefinition;
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
        wizard: options.wizard,
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
        wizard: options.wizard,
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

// ─── Wizard Helper ──────────────────────────────────────────────────────────

/**
 * Evaluate a wizard step condition against collected responses.
 * Returns true if the step should be shown.
 */
function evaluateCondition(
    condition: WizardCondition,
    stepResponses: Map<string, WizardStepResponse>,
): boolean {
    const depResponse = stepResponses.get(condition.dependsOnStep);
    if (!depResponse) return false; // dependency not yet answered → skip

    // Resolve the field value from the response
    let fieldValue: unknown;
    if (condition.field === 'approved') {
        fieldValue = depResponse.approved;
    } else if (condition.field === 'selectedOptionId') {
        fieldValue = depResponse.selectedOptionId;
    } else if (condition.field === 'textInput') {
        fieldValue = depResponse.textInput;
    } else if (depResponse.data) {
        fieldValue = depResponse.data[condition.field];
    }

    switch (condition.operator) {
        case 'equals':
            return fieldValue === condition.value;
        case 'not_equals':
            return fieldValue !== condition.value;
        case 'contains':
            return typeof fieldValue === 'string' && typeof condition.value === 'string'
                ? fieldValue.includes(condition.value)
                : false;
        default:
            return true;
    }
}

/**
 * Run a multi-step wizard interaction.
 *
 * This function:
 * 1. Sends the full wizard definition to the frontend
 * 2. Receives sequential responses for each step
 * 3. Evaluates step conditions for branching
 * 4. Returns all collected responses when the wizard completes
 *
 * @param taskId The task ID (threadId in AG-UI)
 * @param wizard The wizard definition with steps
 * @param timeoutMs Timeout for the entire wizard (default 10 minutes)
 * @returns WizardResult with all step responses
 */
export async function requestWizard(
    taskId: string,
    wizard: WizardDefinition,
    timeoutMs = 600_000,
): Promise<WizardResult> {
    const interactionId = randomUUID();
    const stepResponses = new Map<string, WizardStepResponse>();
    const orderedResponses: WizardStepResponse[] = [];

    const context: InteractionContext = {
        interactionId,
        type: 'wizard',
        title: wizard.title,
        description: wizard.description,
        requestedAt: Date.now(),
        timeoutMs,
        wizard,
    };

    // 1. Set task to waiting_for_input with wizard context
    await supabase
        .from('tasks')
        .update({
            status: 'waiting_for_input',
            interaction_context: context,
        })
        .eq('id', taskId);

    // 2. Emit the full wizard INTERACTION_REQUEST
    agUiEventBus.emit(taskId, {
        type: AgUiEventType.INTERACTION_REQUEST,
        timestamp: Date.now(),
        threadId: taskId,
        interactionId,
        interactionType: 'wizard',
        title: wizard.title,
        description: wizard.description,
        timeoutMs,
        wizard,
    });

    // 3. Loop: wait for each step response from the frontend
    const deadline = Date.now() + timeoutMs;

    try {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        while (true) {
            const remaining = deadline - Date.now();
            if (remaining <= 0) {
                throw new Error(`Wizard timed out after ${timeoutMs}ms`);
            }

            const response = await agUiEventBus.waitForResponse(taskId, interactionId, remaining);

            // User cancelled the entire wizard
            if (response.wizardCancelled) {
                agUiEventBus.emit(taskId, {
                    type: AgUiEventType.WIZARD_CANCELLED,
                    timestamp: Date.now(),
                    threadId: taskId,
                    interactionId,
                });

                await supabase
                    .from('tasks')
                    .update({ status: 'running', interaction_context: null })
                    .eq('id', taskId);

                return { completed: false, responses: orderedResponses };
            }

            // Record this step's response
            if (response.wizardStepId) {
                const stepResponse: WizardStepResponse = {
                    stepId: response.wizardStepId,
                    approved: response.approved,
                    data: response.data,
                    selectedOptionId: response.selectedOptionId,
                };
                stepResponses.set(response.wizardStepId, stepResponse);
                orderedResponses.push(stepResponse);
            }

            // Determine which steps remain (accounting for conditions)
            const completedIds = new Set(stepResponses.keys());
            const remainingSteps = wizard.steps.filter(step => {
                if (completedIds.has(step.stepId)) return false;
                if (step.condition && !evaluateCondition(step.condition, stepResponses)) return false;
                return true;
            });

            if (remainingSteps.length === 0) {
                // All steps answered → wizard complete
                agUiEventBus.emit(taskId, {
                    type: AgUiEventType.WIZARD_COMPLETE,
                    timestamp: Date.now(),
                    threadId: taskId,
                    interactionId,
                    responses: orderedResponses,
                });

                await supabase
                    .from('tasks')
                    .update({ status: 'running', interaction_context: null })
                    .eq('id', taskId);

                return { completed: true, responses: orderedResponses };
            }

            // Emit step advance for the frontend to move to the next step
            agUiEventBus.emit(taskId, {
                type: AgUiEventType.WIZARD_STEP_ADVANCE,
                timestamp: Date.now(),
                threadId: taskId,
                interactionId,
                completedStepId: response.wizardStepId,
                nextStepId: remainingSteps[0].stepId,
                completedStepIds: Array.from(completedIds),
                totalSteps: wizard.steps.length,
                remainingSteps: remainingSteps.length,
            });
        }
    } catch (err) {
        // Timeout
        agUiEventBus.emit(taskId, {
            type: AgUiEventType.INTERACTION_TIMEOUT,
            timestamp: Date.now(),
            threadId: taskId,
            interactionId,
        });

        await supabase
            .from('tasks')
            .update({
                status: 'failed',
                error: `Wizard timed out: ${wizard.title}`,
                interaction_context: null,
            })
            .eq('id', taskId);

        throw err;
    }
}
