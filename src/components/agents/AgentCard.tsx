// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { Link } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { StatusIndicator } from '@/components/ui/StatusIndicator'
import { isKnownModel } from '@/lib/modelValidation'
import type { Agent } from '@/types'

interface AgentCardProps {
    agent: Agent
}

/**
 * Agent card for grid view.
 * Shows avatar (image or initials), status dot, name, description,
 * model badge, and creation date. Clickable — navigates to detail.
 */
export function AgentCard({ agent }: AgentCardProps) {
    const initials = agent.name
        .split(/\s+/)
        .map((w) => w.charAt(0))
        .join('')
        .slice(0, 2)
        .toUpperCase()

    const modelShort = agent.model.split('/').pop() ?? agent.model

    return (
        <Link to={`/agents/${agent.id}`} className="group relative block rounded-lg border border-border bg-surface-card p-5 transition-colors hover:border-gray-600">
            {/* Header: avatar + status */}
            <div className="mb-4 flex items-start gap-3">
                {agent.avatar_url ? (
                    <img
                        src={agent.avatar_url}
                        alt={agent.name}
                        className="h-10 w-10 rounded-full object-cover"
                    />
                ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-muted text-sm font-semibold text-brand-primary">
                        {initials}
                    </div>
                )}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <h3 className="truncate text-sm font-semibold text-gray-100">{agent.name}</h3>
                        <StatusIndicator status={agent.status} size="sm" />
                    </div>
                    <p className="mt-0.5 truncate text-xs text-gray-500">{agent.description || 'No description'}</p>
                </div>
            </div>

            {/* Model badge */}
            <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-elevated px-2 py-0.5 text-xs font-medium text-gray-400">
                    {!isKnownModel(agent.model) && (
                        <AlertTriangle className="h-3 w-3 text-yellow-400" />
                    )}
                    {modelShort}
                </span>
            </div>

            {/* Footer */}
            <div className="mt-4 flex items-center justify-between border-t border-border-muted pt-3">
                <span className="text-xs text-gray-600">
                    Created {new Date(agent.created_at).toLocaleDateString()}
                </span>
                <StatusLabel status={agent.status} />
            </div>
        </Link>
    )
}

function StatusLabel({ status }: { status: Agent['status'] }) {
    const labels: Record<Agent['status'], { text: string; className: string }> = {
        idle: { text: 'Idle', className: 'text-status-success-text' },
        busy: { text: 'Busy', className: 'text-status-warning-text' },
        offline: { text: 'Offline', className: 'text-gray-500' },
    }
    const config = labels[status]
    return <span className={`text-xs font-medium ${config.className}`}>{config.text}</span>
}
