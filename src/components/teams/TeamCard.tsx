// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { Link } from 'react-router-dom'
import { GitBranch, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Team, PipelineConfig } from '@/types'

const MODE_BADGE: Record<string, { label: string; className: string }> = {
    pipeline: { label: 'Pipeline', className: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
    orchestrator: { label: 'Orchestrator', className: 'bg-purple-500/10 text-purple-400 border-purple-500/30' },
    collaboration: { label: 'Collaboration', className: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
}

interface TeamCardProps {
    team: Team
}

/**
 * Card component for the Teams list page.
 * Shows team name, mode badge, step/agent count, and created date.
 */
export function TeamCard({ team }: TeamCardProps) {
    const badge = MODE_BADGE[team.mode]
    const stepCount = team.mode === 'pipeline'
        ? (team.config as PipelineConfig).steps.length
        : 0

    return (
        <Link
            to={`/teams/${team.id}`}
            className="group flex flex-col rounded-xl border border-border bg-surface-card p-5 transition-all hover:border-brand-primary/40 hover:shadow-lg hover:shadow-brand-primary/5"
        >
            {/* Header */}
            <div className="mb-3 flex items-start justify-between">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-muted">
                        <GitBranch className="h-5 w-5 text-brand-primary" />
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold text-gray-100 group-hover:text-brand-primary transition-colors">
                            {team.name}
                        </h3>
                        <span className={cn(
                            'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium mt-1',
                            badge.className,
                        )}>
                            {badge.label}
                        </span>
                    </div>
                </div>
            </div>

            {/* Description */}
            {team.description && (
                <p className="mb-3 line-clamp-2 text-xs text-gray-500">
                    {team.description}
                </p>
            )}

            {/* Footer */}
            <div className="mt-auto flex items-center gap-4 border-t border-border pt-3 text-xs text-gray-500">
                {team.mode === 'pipeline' && (
                    <span className="flex items-center gap-1">
                        <GitBranch className="h-3 w-3" />
                        {stepCount} step{stepCount !== 1 ? 's' : ''}
                    </span>
                )}
                <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {new Date(team.created_at).toLocaleDateString()}
                </span>
            </div>
        </Link>
    )
}
