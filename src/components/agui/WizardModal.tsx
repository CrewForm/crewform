// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useState, useEffect, useCallback, useMemo } from 'react'
import type {
    AgUiInteractionRequest,
    AgUiWizardState,
    AgUiWizardStepResponse,
    AgUiWizardCondition,
} from '../../hooks/useAgentStream'
import './WizardModal.css'

// ─── Condition Evaluator ────────────────────────────────────────────────────

function evaluateCondition(
    condition: AgUiWizardCondition,
    responses: AgUiWizardStepResponse[],
): boolean {
    const depResponse = responses.find(r => r.stepId === condition.dependsOnStep)
    if (!depResponse) return false

    let fieldValue: unknown
    if (condition.field === 'approved') {
        fieldValue = depResponse.approved
    } else if (condition.field === 'selectedOptionId') {
        fieldValue = depResponse.selectedOptionId
    } else if (condition.field === 'textInput') {
        fieldValue = depResponse.textInput
    } else if (depResponse.data) {
        fieldValue = depResponse.data[condition.field]
    }

    switch (condition.operator) {
        case 'equals':
            return fieldValue === condition.value
        case 'not_equals':
            return fieldValue !== condition.value
        case 'contains':
            return typeof fieldValue === 'string' && typeof condition.value === 'string'
                ? fieldValue.includes(condition.value)
                : false
        default:
            return true
    }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatValue(value: unknown, fallback = '—'): string {
    if (value === null || value === undefined) return fallback
    if (typeof value === 'object') return JSON.stringify(value)
    return String(value as string | number | boolean)
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface WizardModalProps {
    interaction: AgUiInteractionRequest
    wizardState: AgUiWizardState
    onRespond: (response: {
        interactionId: string
        approved?: boolean
        data?: Record<string, unknown>
        selectedOptionId?: string
        wizardStepId?: string
        wizardCancelled?: boolean
    }) => void
}

// ─── Component ──────────────────────────────────────────────────────────────

export function WizardModal({ interaction, wizardState, onRespond }: WizardModalProps) {
    const [timeRemaining, setTimeRemaining] = useState<number>(interaction.timeoutMs)
    const [localStepIndex, setLocalStepIndex] = useState(wizardState.currentStepIndex)
    const [localResponses, setLocalResponses] = useState<AgUiWizardStepResponse[]>(wizardState.responses)
    const [localCompletedIds, setLocalCompletedIds] = useState<Set<string>>(new Set(wizardState.completedStepIds))

    // Per-step form state
    const [selectedOption, setSelectedOption] = useState<string | null>(null)
    const [textInput, setTextInput] = useState('')
    const [formData, setFormData] = useState<Record<string, unknown>>({})
    const [editedData, setEditedData] = useState<Record<string, unknown> | null>(null)
    const [isEditing, setIsEditing] = useState(false)

    // Sync with external wizard state updates from the backend
    useEffect(() => {
        setLocalStepIndex(wizardState.currentStepIndex)
        setLocalCompletedIds(prev => {
            if (wizardState.completedStepIds.length > prev.size) {
                return new Set(wizardState.completedStepIds)
            }
            return prev
        })
    }, [wizardState.currentStepIndex, wizardState.completedStepIds])

    // Countdown timer
    useEffect(() => {
        const deadline = interaction.requestedAt + interaction.timeoutMs
        const interval = setInterval(() => {
            const remaining = Math.max(0, deadline - Date.now())
            setTimeRemaining(remaining)
            if (remaining <= 0) clearInterval(interval)
        }, 1000)
        return () => clearInterval(interval)
    }, [interaction.requestedAt, interaction.timeoutMs])

    // Compute visible steps (skip those whose conditions are not met)
    const visibleSteps = useMemo(() => wizardState.steps.filter(step => {
        if (!step.condition) return true
        return evaluateCondition(step.condition, localResponses)
    }), [wizardState.steps, localResponses])

    const currentStep = visibleSteps[localStepIndex] ?? visibleSteps[0]
    const currentStepId = currentStep.stepId
    const currentStepType = currentStep.type
    const currentStepFields = currentStep.fields
    const isLastStep = localStepIndex >= visibleSteps.length - 1
    const timeRemainingSeconds = Math.ceil(timeRemaining / 1000)
    const isUrgent = timeRemainingSeconds <= 30

    // Reset per-step state when step changes
    useEffect(() => {
        setSelectedOption(null)
        setTextInput('')
        setFormData({})
        setEditedData(null)
        setIsEditing(false)

        // Initialize form defaults
        if (currentStepType === 'form' && currentStepFields) {
            const defaults: Record<string, unknown> = {}
            for (const field of currentStepFields) {
                if (field.defaultValue !== undefined) {
                    defaults[field.key] = field.defaultValue
                }
            }
            setFormData(defaults)
        }
    }, [currentStepId, currentStepType, currentStepFields])

    // ─── Submit current step ────────────────────────────────────────────

    const submitStep = useCallback(() => {
        if (!currentStepId) return

        const stepResponse: AgUiWizardStepResponse = { stepId: currentStep.stepId }

        switch (currentStep.type) {
            case 'approval':
                stepResponse.approved = true
                break
            case 'confirm_data':
                stepResponse.approved = true
                stepResponse.data = editedData ?? currentStep.data ?? undefined
                break
            case 'choice':
                if (!selectedOption) return
                stepResponse.selectedOptionId = selectedOption
                break
            case 'text_input':
                if (!textInput.trim()) return
                stepResponse.textInput = textInput.trim()
                stepResponse.data = { text: textInput.trim() }
                break
            case 'form': {
                // Validate required fields
                if (currentStep.fields) {
                    for (const field of currentStep.fields) {
                        if (field.required && !formData[field.key]) return
                    }
                }
                stepResponse.data = { ...formData }
                break
            }
        }

        // Update local state immediately for responsive feel
        setLocalResponses(prev => [...prev, stepResponse])
        setLocalCompletedIds(prev => {
            const next = new Set(prev)
            next.add(currentStep.stepId)
            return next
        })

        // Send response to backend
        onRespond({
            interactionId: interaction.interactionId,
            approved: stepResponse.approved,
            data: stepResponse.data,
            selectedOptionId: stepResponse.selectedOptionId,
            wizardStepId: currentStep.stepId,
        })

        // Advance to next visible step locally
        if (!isLastStep) {
            setLocalStepIndex(prev => prev + 1)
        }
    }, [currentStep, currentStepId, selectedOption, textInput, formData, editedData, interaction.interactionId, onRespond, isLastStep])

    const rejectStep = useCallback(() => {
        if (!currentStepId) return
        if (currentStep.type === 'approval' || currentStep.type === 'confirm_data') {
            const stepResponse: AgUiWizardStepResponse = {
                stepId: currentStep.stepId,
                approved: false,
            }
            setLocalResponses(prev => [...prev, stepResponse])
            setLocalCompletedIds(prev => {
                const next = new Set(prev)
                next.add(currentStep.stepId)
                return next
            })
            onRespond({
                interactionId: interaction.interactionId,
                approved: false,
                wizardStepId: currentStep.stepId,
            })
            if (!isLastStep) {
                setLocalStepIndex(prev => prev + 1)
            }
        }
    }, [currentStep, currentStepId, interaction.interactionId, onRespond, isLastStep])

    const cancelWizard = useCallback(() => {
        onRespond({
            interactionId: interaction.interactionId,
            wizardCancelled: true,
        })
    }, [interaction.interactionId, onRespond])

    const goBack = useCallback(() => {
        if (localStepIndex > 0) {
            // Remove the last response
            setLocalResponses(prev => {
                const next = [...prev]
                next.pop()
                return next
            })
            setLocalStepIndex(prev => prev - 1)
        }
    }, [localStepIndex])

    if (!currentStepId) return null

    return (
        <div className="wizard-modal-overlay">
            <div className="wizard-modal">
                {/* Header */}
                <div className="wizard-modal-header">
                    <div className="wizard-modal-icon">🧙</div>
                    <div>
                        <h3 className="wizard-modal-title">{interaction.wizard?.title ?? interaction.title}</h3>
                        {interaction.wizard?.description && (
                            <p className="wizard-modal-description">{interaction.wizard.description}</p>
                        )}
                    </div>
                    <div className={`wizard-modal-timer ${isUrgent ? 'urgent' : ''}`}>
                        {timeRemainingSeconds > 0 ? `${Math.floor(timeRemainingSeconds / 60)}:${(timeRemainingSeconds % 60).toString().padStart(2, '0')}` : 'Expired'}
                    </div>
                </div>

                {/* Step indicator */}
                <div className="wizard-stepper">
                    {visibleSteps.map((step, idx) => (
                        <div
                            key={step.stepId}
                            className={`wizard-stepper-dot ${
                                localCompletedIds.has(step.stepId) ? 'completed' :
                                idx === localStepIndex ? 'active' : ''
                            }`}
                        >
                            <div className="wizard-stepper-circle">
                                {localCompletedIds.has(step.stepId) ? '✓' : idx + 1}
                            </div>
                            <span className="wizard-stepper-label">{step.title}</span>
                        </div>
                    ))}
                    <div className="wizard-stepper-line" style={{
                        width: `${visibleSteps.length > 1 ? ((localStepIndex) / (visibleSteps.length - 1)) * 100 : 0}%`
                    }} />
                </div>

                {/* Step content */}
                <div className="wizard-modal-body" key={currentStep.stepId}>
                    <h4 className="wizard-step-title">{currentStep.title}</h4>
                    {currentStep.description && (
                        <p className="wizard-step-description">{currentStep.description}</p>
                    )}

                    {/* Approval */}
                    {currentStep.type === 'approval' && (
                        <div className="wizard-actions">
                            <button
                                className="wizard-btn wizard-btn-approve"
                                onClick={submitStep}
                                disabled={timeRemaining <= 0}
                            >
                                ✓ Approve
                            </button>
                            <button
                                className="wizard-btn wizard-btn-reject"
                                onClick={rejectStep}
                                disabled={timeRemaining <= 0}
                            >
                                ✕ Reject
                            </button>
                        </div>
                    )}

                    {/* Data Confirmation */}
                    {currentStep.type === 'confirm_data' && currentStep.data && (
                        <>
                            <div className="wizard-data-table">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Field</th>
                                            <th>Value</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {Object.entries(isEditing && editedData ? editedData : currentStep.data).map(([key, value]) => (
                                            <tr key={key}>
                                                <td className="wizard-data-key">{key}</td>
                                                <td className="wizard-data-value">
                                                    {isEditing ? (
                                                        <input
                                                            type="text"
                                                            className="wizard-data-input"
                                                            value={formatValue(value, '')}
                                                            onChange={(e) => {
                                                                setEditedData(prev => ({
                                                                    ...(prev ?? currentStep.data ?? {}),
                                                                    [key]: e.target.value,
                                                                }))
                                                            }}
                                                        />
                                                    ) : (
                                                        <span>{formatValue(value)}</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="wizard-actions">
                                <button
                                    className="wizard-btn wizard-btn-approve"
                                    onClick={submitStep}
                                    disabled={timeRemaining <= 0}
                                >
                                    ✓ {isEditing ? 'Confirm Changes' : 'Confirm'}
                                </button>
                                {!isEditing && (
                                    <button
                                        className="wizard-btn wizard-btn-edit"
                                        onClick={() => {
                                            setIsEditing(true)
                                            setEditedData({ ...currentStep.data })
                                        }}
                                        disabled={timeRemaining <= 0}
                                    >
                                        ✎ Edit
                                    </button>
                                )}
                                <button
                                    className="wizard-btn wizard-btn-reject"
                                    onClick={rejectStep}
                                    disabled={timeRemaining <= 0}
                                >
                                    ✕ Reject
                                </button>
                            </div>
                        </>
                    )}

                    {/* Choice */}
                    {currentStep.type === 'choice' && currentStep.choices && (
                        <>
                            <div className="wizard-choices">
                                {currentStep.choices.map((choice) => (
                                    <label
                                        key={choice.id}
                                        className={`wizard-choice ${selectedOption === choice.id ? 'selected' : ''}`}
                                    >
                                        <input
                                            type="radio"
                                            name={`wizard-choice-${currentStep.stepId}`}
                                            value={choice.id}
                                            checked={selectedOption === choice.id}
                                            onChange={() => setSelectedOption(choice.id)}
                                            disabled={timeRemaining <= 0}
                                        />
                                        <div className="wizard-choice-content">
                                            <span className="wizard-choice-label">{choice.label}</span>
                                            {choice.description && (
                                                <span className="wizard-choice-desc">{choice.description}</span>
                                            )}
                                        </div>
                                    </label>
                                ))}
                            </div>
                        </>
                    )}

                    {/* Text Input */}
                    {currentStep.type === 'text_input' && (
                        <div className="wizard-text-input-wrapper">
                            <textarea
                                className="wizard-text-input"
                                placeholder={currentStep.placeholder ?? 'Enter your response...'}
                                value={textInput}
                                onChange={(e) => setTextInput(e.target.value)}
                                rows={3}
                                disabled={timeRemaining <= 0}
                            />
                        </div>
                    )}

                    {/* Form */}
                    {currentStep.type === 'form' && currentStep.fields && (
                        <div className="wizard-form">
                            {currentStep.fields.map((field) => (
                                <div key={field.key} className="wizard-form-group">
                                    <label className="wizard-form-label">
                                        {field.label}
                                        {field.required && <span className="wizard-form-required">*</span>}
                                    </label>

                                    {field.type === 'textarea' ? (
                                        <textarea
                                            className="wizard-form-textarea"
                                            placeholder={field.placeholder}
                                            value={formatValue(formData[field.key], '')}
                                            onChange={(e) => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
                                            rows={3}
                                            disabled={timeRemaining <= 0}
                                        />
                                    ) : field.type === 'select' && field.options ? (
                                        <select
                                            className="wizard-form-select"
                                            value={formatValue(formData[field.key], '')}
                                            onChange={(e) => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
                                            disabled={timeRemaining <= 0}
                                        >
                                            <option value="">Select...</option>
                                            {field.options.map(opt => (
                                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                                            ))}
                                        </select>
                                    ) : field.type === 'toggle' ? (
                                        <label className="wizard-form-toggle">
                                            <input
                                                type="checkbox"
                                                checked={Boolean(formData[field.key])}
                                                onChange={(e) => setFormData(prev => ({ ...prev, [field.key]: e.target.checked }))}
                                                disabled={timeRemaining <= 0}
                                            />
                                            <span className="wizard-form-toggle-slider" />
                                        </label>
                                    ) : (
                                        <input
                                            type={field.type}
                                            className="wizard-form-input"
                                            placeholder={field.placeholder}
                                            value={formatValue(formData[field.key], '')}
                                            onChange={(e) => setFormData(prev => ({
                                                ...prev,
                                                [field.key]: field.type === 'number' ? Number(e.target.value) : e.target.value,
                                            }))}
                                            disabled={timeRemaining <= 0}
                                        />
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Navigation footer */}
                <div className="wizard-modal-footer">
                    <div className="wizard-footer-left">
                        <button
                            className="wizard-btn wizard-btn-cancel"
                            onClick={cancelWizard}
                        >
                            Cancel
                        </button>
                        {localStepIndex > 0 && (
                            <button
                                className="wizard-btn wizard-btn-back"
                                onClick={goBack}
                            >
                                ← Back
                            </button>
                        )}
                    </div>

                    <div className="wizard-footer-center">
                        <span className="wizard-step-counter">
                            Step {localStepIndex + 1} of {visibleSteps.length}
                        </span>
                    </div>

                    <div className="wizard-footer-right">
                        {currentStep.type !== 'approval' && currentStep.type !== 'confirm_data' && (
                            <button
                                className="wizard-btn wizard-btn-next"
                                onClick={submitStep}
                                disabled={
                                    timeRemaining <= 0 ||
                                    (currentStep.type === 'choice' && !selectedOption) ||
                                    (currentStep.type === 'text_input' && !textInput.trim())
                                }
                            >
                                {isLastStep ? '✓ Complete' : 'Next →'}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
