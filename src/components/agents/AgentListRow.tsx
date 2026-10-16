// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { Link } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { StatusIndicator } from '@/components/ui/StatusIndicator'
import { isKnownModel } from '@/lib/modelValidation'
import type { Agent } from '@/types'

interface AgentListRowProps {
    agent: Agent
}

/**
 * Compact list row for agents (table/list view).
 * Shows: avatar · name · status · model · description · created date
 * Clickable — navigates to detail.
 */
export function AgentListRow({ agent }: AgentListRowProps) {
    const initials = agent.name
        .split(/\s+/)
        .map((w) => w.charAt(0))
        .join('')
        .slice(0, 2)
        .toUpperCase()

    const modelShort = agent.model.split('/').pop() ?? agent.model

    return (
        <Link to={`/agents/${agent.id}`} className="flex items-center gap-4 rounded-lg border border-border bg-surface-card px-4 py-3 transition-colors hover:border-gray-600">
            {/* Avatar */}
            {agent.avatar_url ? (
                <img
                    src={agent.avatar_url}
                    alt={agent.name}
                    className="h-8 w-8 shrink-0 rounded-full object-cover"
                />
            ) : (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-muted text-xs font-semibold text-brand-primary">
                    {initials}
                </div>
            )}

            {/* Name + status */}
            <div className="flex items-center gap-2 min-w-0 w-40 shrink-0">
                <span className="truncate text-sm font-medium text-gray-200">{agent.name}</span>
                <StatusIndicator status={agent.status} size="sm" />
            </div>

            {/* Model badge */}
            <span className="hidden shrink-0 items-center gap-1.5 rounded-md border border-border bg-surface-elevated px-2 py-0.5 text-xs font-medium text-gray-400 sm:inline-flex">
                {!isKnownModel(agent.model) && (
                    <AlertTriangle className="h-3 w-3 text-yellow-400" />
                )}
                {modelShort}
            </span>

            {/* Description */}
            <p className="hidden flex-1 truncate text-xs text-gray-500 md:block">
                {agent.description || '—'}
            </p>

            {/* Created date */}
            <span className="ml-auto shrink-0 text-xs text-gray-600">
                {new Date(agent.created_at).toLocaleDateString()}
            </span>
        </Link>
    )
}
