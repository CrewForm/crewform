// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useState, useEffect } from 'react'
import './InteractionModal.css'

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatValue(value: unknown, fallback = '—'): string {
    if (value === null || value === undefined) return fallback
    if (typeof value === 'object') return JSON.stringify(value)
    return String(value as string | number | boolean)
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface InteractionRequest {
    interactionId: string
    interactionType: 'approval' | 'confirm_data' | 'choice'
    title: string
    description?: string
    data?: Record<string, unknown>
    choices?: { id: string; label: string; description?: string }[]
    timeoutMs: number
    requestedAt: number
}

interface InteractionModalProps {
    interaction: InteractionRequest
    onRespond: (response: {
        interactionId: string
        approved?: boolean
        data?: Record<string, unknown>
        selectedOptionId?: string
    }) => void
}

// ─── Component ──────────────────────────────────────────────────────────────

export function InteractionModal({ interaction, onRespond }: InteractionModalProps) {
    const [selectedOption, setSelectedOption] = useState<string | null>(null)
    const [editedData, setEditedData] = useState<Record<string, unknown> | null>(null)
    const [isEditing, setIsEditing] = useState(false)
    const [timeRemaining, setTimeRemaining] = useState<number>(interaction.timeoutMs)

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

    const timeRemainingSeconds = Math.ceil(timeRemaining / 1000)
    const isUrgent = timeRemainingSeconds <= 30

    return (
        <div className="interaction-modal-overlay">
            <div className="interaction-modal">
                {/* Header */}
                <div className="interaction-modal-header">
                    <div className="interaction-modal-icon">
                        {interaction.interactionType === 'approval' && '✋'}
                        {interaction.interactionType === 'confirm_data' && '📋'}
                        {interaction.interactionType === 'choice' && '🔀'}
                    </div>
                    <div>
                        <h3 className="interaction-modal-title">{interaction.title}</h3>
                        {interaction.description && (
                            <p className="interaction-modal-description">{interaction.description}</p>
                        )}
                    </div>
                    <div className={`interaction-modal-timer ${isUrgent ? 'urgent' : ''}`}>
                        {timeRemainingSeconds > 0 ? `${Math.floor(timeRemainingSeconds / 60)}:${(timeRemainingSeconds % 60).toString().padStart(2, '0')}` : 'Expired'}
                    </div>
                </div>

                {/* Body — varies by interaction type */}
                <div className="interaction-modal-body">
                    {/* Approval */}
                    {interaction.interactionType === 'approval' && (
                        <div className="interaction-actions">
                            <button
                                className="interaction-btn interaction-btn-approve"
                                onClick={() => onRespond({ interactionId: interaction.interactionId, approved: true })}
                                disabled={timeRemaining <= 0}
                            >
                                ✓ Approve
                            </button>
                            <button
                                className="interaction-btn interaction-btn-reject"
                                onClick={() => onRespond({ interactionId: interaction.interactionId, approved: false })}
                                disabled={timeRemaining <= 0}
                            >
                                ✕ Reject
                            </button>
                        </div>
                    )}

                    {/* Data Confirmation */}
                    {interaction.interactionType === 'confirm_data' && interaction.data && (
                        <>
                            <div className="interaction-data-table">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Field</th>
                                            <th>Value</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {Object.entries(isEditing && editedData ? editedData : interaction.data).map(([key, value]) => (
                                            <tr key={key}>
                                                <td className="interaction-data-key">{key}</td>
                                                <td className="interaction-data-value">
                                                    {isEditing ? (
                                                        <input
                                                            type="text"
                                                            className="interaction-data-input"
                                                            value={formatValue(value, '')}
                                                            onChange={(e) => {
                                                                setEditedData(prev => ({
                                                                    ...(prev ?? interaction.data ?? {}),
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
                            <div className="interaction-actions">
                                <button
                                    className="interaction-btn interaction-btn-approve"
                                    onClick={() => onRespond({
                                        interactionId: interaction.interactionId,
                                        approved: true,
                                        data: editedData ?? undefined,
                                    })}
                                    disabled={timeRemaining <= 0}
                                >
                                    ✓ {isEditing ? 'Confirm Changes' : 'Confirm'}
                                </button>
                                {!isEditing && (
                                    <button
                                        className="interaction-btn interaction-btn-edit"
                                        onClick={() => {
                                            setIsEditing(true)
                                            setEditedData({ ...interaction.data })
                                        }}
                                        disabled={timeRemaining <= 0}
                                    >
                                        ✎ Edit
                                    </button>
                                )}
                                <button
                                    className="interaction-btn interaction-btn-reject"
                                    onClick={() => onRespond({ interactionId: interaction.interactionId, approved: false })}
                                    disabled={timeRemaining <= 0}
                                >
                                    ✕ Reject
                                </button>
                            </div>
                        </>
                    )}

                    {/* Choice */}
                    {interaction.interactionType === 'choice' && interaction.choices && (
                        <>
                            <div className="interaction-choices">
                                {interaction.choices.map((choice) => (
                                    <label
                                        key={choice.id}
                                        className={`interaction-choice ${selectedOption === choice.id ? 'selected' : ''}`}
                                    >
                                        <input
                                            type="radio"
                                            name="interaction-choice"
                                            value={choice.id}
                                            checked={selectedOption === choice.id}
                                            onChange={() => setSelectedOption(choice.id)}
                                            disabled={timeRemaining <= 0}
                                        />
                                        <div className="interaction-choice-content">
                                            <span className="interaction-choice-label">{choice.label}</span>
                                            {choice.description && (
                                                <span className="interaction-choice-desc">{choice.description}</span>
                                            )}
                                        </div>
                                    </label>
                                ))}
                            </div>
                            <div className="interaction-actions">
                                <button
                                    className="interaction-btn interaction-btn-approve"
                                    onClick={() => {
                                        if (selectedOption) {
                                            onRespond({
                                                interactionId: interaction.interactionId,
                                                selectedOptionId: selectedOption,
                                            })
                                        }
                                    }}
                                    disabled={!selectedOption || timeRemaining <= 0}
                                >
                                    ✓ Select
                                </button>
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="interaction-modal-footer">
                    <span className="interaction-modal-badge">Agent requires input</span>
                </div>
            </div>
        </div>
    )
}
