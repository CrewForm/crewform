// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { Star, Download, GitBranch, Users, Zap } from 'lucide-react'
import type { Team } from '@/types'

interface TeamCardProps {
    team: Team
    onClick: (team: Team) => void
}

const modeConfig: Record<string, { label: string; color: string; icon: typeof GitBranch }> = {
    pipeline: { label: 'Pipeline', color: 'bg-blue-500/10 text-blue-400', icon: GitBranch },
    orchestrator: { label: 'Orchestrator', color: 'bg-purple-500/10 text-purple-400', icon: Zap },
    collaboration: { label: 'Collaboration', color: 'bg-green-500/10 text-green-400', icon: Users },
}

export function TeamCard({ team, onClick }: TeamCardProps) {
    const mode = modeConfig[team.mode] ?? modeConfig.pipeline
    const ModeIcon = mode.icon

    // Count agents in team config
    const agentCount = getTeamAgentCount(team)

    return (
        <button
            type="button"
            onClick={() => onClick(team)}
            className="group w-full rounded-xl border border-border bg-surface-card p-5 text-left transition-all hover:border-brand-primary/40 hover:shadow-lg hover:shadow-brand-primary/5"
        >
            {/* Header */}
            <div className="mb-3 flex items-start justify-between">
                <div className="flex-1 min-w-0">
                    <h3 className="truncate text-base font-semibold text-gray-100 group-hover:text-brand-primary transition-colors">
                        {team.name}
                    </h3>
                    <div className="mt-1 flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${mode.color}`}>
                            <ModeIcon className="h-3 w-3" />
                            {mode.label}
                        </span>
                        <span className="text-xs text-gray-500">
                            {agentCount} agent{agentCount !== 1 ? 's' : ''}
                        </span>
                    </div>
                </div>
            </div>

            {/* Description */}
            <p className="mb-3 line-clamp-2 text-sm text-gray-400">
                {team.description}
            </p>

            {/* Tags */}
            <div className="mb-3 flex flex-wrap gap-1.5">
                {team.marketplace_tags.map((tag) => (
                    <span
                        key={tag}
                        className="rounded-md bg-surface-overlay px-2 py-0.5 text-xs text-gray-400"
                    >
                        {tag}
                    </span>
                ))}
            </div>

            {/* Stats */}
            <div className="flex items-center gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                    <Download className="h-3.5 w-3.5" />
                    {team.install_count.toLocaleString()}
                </span>
                <span className="flex items-center gap-1">
                    <Star className="h-3.5 w-3.5 text-amber-400" />
                    {team.rating_avg.toFixed(1)}
                </span>
                <span className="ml-auto text-gray-600 capitalize">{team.mode}</span>
            </div>
        </button>
    )
}

function getTeamAgentCount(team: Team): number {
    const config = team.config
    const ids = new Set<string>()

    if ('steps' in config) {
        for (const step of config.steps) {
            ids.add(step.agent_id)
            if (step.parallel_agents) step.parallel_agents.forEach(id => ids.add(id))
            if (step.merge_agent_id) ids.add(step.merge_agent_id)
        }
    }
    if ('brain_agent_id' in config && config.brain_agent_id) ids.add(config.brain_agent_id)
    if ('worker_agent_ids' in config && Array.isArray(config.worker_agent_ids)) {
        config.worker_agent_ids.forEach(id => ids.add(id))
    }
    if ('agent_ids' in config && Array.isArray(config.agent_ids)) {
        config.agent_ids.forEach((id: string) => ids.add(id))
    }

    return ids.size || 1
}
