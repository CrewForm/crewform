// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { Bot } from 'lucide-react'
import type { AgentFormData } from '@/lib/agentSchema'

interface AgentReviewProps {
    data: AgentFormData
    onBack: () => void
    onCreate: () => void
    isCreating: boolean
    error: string | null
}

/**
 * Step 3: Review summary before creating the agent.
 * Shows all configured values with Back + Create buttons.
 */
export function AgentReview({ data, onBack, onCreate, isCreating, error }: AgentReviewProps) {
    const modelShort = data.model.split('/').pop() ?? data.model
    const initials = data.name
        .split(/\s+/)
        .map((w) => w.charAt(0))
        .join('')
        .slice(0, 2)
        .toUpperCase()

    return (
        <div>
            <p className="mb-6 text-sm text-gray-400">
                Review your agent configuration, then create it.
            </p>

            {error && (
                <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                    {error}
                </div>
            )}

            {/* Summary card */}
            <div className="rounded-lg border border-border bg-surface-card p-6">
                {/* Header */}
                <div className="mb-6 flex items-center gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-muted text-lg font-bold text-brand-primary">
                        {initials || <Bot className="h-6 w-6" />}
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-gray-100">{data.name || 'Untitled Agent'}</h3>
                        <p className="text-sm text-gray-500">{data.description || 'No description'}</p>
                    </div>
                </div>

                {/* Details grid */}
                <div className="space-y-4">
                    <ReviewField label="Model" value={modelShort} />
                    <ReviewField label="Temperature" value={data.temperature.toFixed(1)} />
                    {data.system_prompt && (
                        <div>
                            <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
                                System Prompt
                            </span>
                            <pre className="max-h-40 overflow-auto rounded-lg border border-border-muted bg-surface-primary p-3 font-mono text-xs leading-relaxed text-gray-300">
                                {data.system_prompt}
                            </pre>
                        </div>
                    )}
                    {data.tools.length > 0 && (
                        <ReviewField label="Tools" value={data.tools.join(', ')} />
                    )}
                </div>
            </div>

            {/* Actions */}
            <div className="mt-6 flex items-center justify-between">
                <button
                    type="button"
                    onClick={onBack}
                    disabled={isCreating}
                    className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-gray-400 transition-colors hover:bg-surface-elevated hover:text-gray-200 disabled:opacity-50"
                >
                    Back
                </button>
                <button
                    type="button"
                    onClick={onCreate}
                    disabled={isCreating}
                    className="rounded-lg bg-brand-primary px-6 py-2.5 text-sm font-medium text-black transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {isCreating ? 'Creating...' : 'Create Agent'}
                </button>
            </div>
        </div>
    )
}

function ReviewField({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <span className="mb-0.5 block text-xs font-medium uppercase tracking-wider text-gray-500">
                {label}
            </span>
            <span className="text-sm text-gray-200">{value}</span>
        </div>
    )
}
