// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { X, Download, Star, GitBranch, Users, Zap, Loader2 } from 'lucide-react'
import type { Team } from '@/types'
import { cn } from '@/lib/utils'

interface TeamDetailModalProps {
    team: Team | null
    onClose: () => void
    onInstall: (team: Team) => void
    isInstalling: boolean
}

const modeConfig: Record<string, { label: string; color: string; icon: typeof GitBranch; description: string }> = {
    pipeline: {
        label: 'Pipeline',
        color: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
        icon: GitBranch,
        description: 'Agents execute sequentially — each passes output to the next.',
    },
    orchestrator: {
        label: 'Orchestrator',
        color: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
        icon: Zap,
        description: 'A brain agent delegates sub-tasks to workers and assembles the result.',
    },
    collaboration: {
        label: 'Collaboration',
        color: 'bg-green-500/10 text-green-400 border-green-500/20',
        icon: Users,
        description: 'Agents discuss in a shared thread and converge on a consensus.',
    },
}

export function TeamDetailModal({ team, onClose, onInstall, isInstalling }: TeamDetailModalProps) {
    if (!team) return null

    const mode = modeConfig[team.mode] ?? modeConfig.pipeline
    const ModeIcon = mode.icon

    // Count agents
    const agentCount = getAgentCount(team)

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
            <div
                className="w-full max-w-lg rounded-xl border border-border bg-surface-primary shadow-2xl max-h-[80vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-border px-5 py-4 shrink-0">
                    <div className="flex-1 min-w-0">
                        <h2 className="truncate text-lg font-semibold text-gray-100">{team.name}</h2>
                        <div className="mt-1 flex items-center gap-2">
                            <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium', mode.color)}>
                                <ModeIcon className="h-3 w-3" />
                                {mode.label}
                            </span>
                            <span className="text-xs text-gray-500">{agentCount} agent{agentCount !== 1 ? 's' : ''}</span>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} className="rounded-lg p-1 text-gray-500 hover:text-gray-300">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="overflow-y-auto flex-1 p-5 space-y-4">
                    {/* Description */}
                    <p className="text-sm text-gray-400 leading-relaxed">{team.description}</p>

                    {/* Mode info */}
                    <div className={cn('rounded-lg border p-3', mode.color)}>
                        <p className="text-xs">{mode.description}</p>
                    </div>

                    {/* Stats */}
                    <div className="flex gap-6">
                        <div>
                            <p className="text-xs text-gray-500">Installs</p>
                            <p className="flex items-center gap-1 text-sm font-medium text-gray-200">
                                <Download className="h-3.5 w-3.5 text-gray-400" />
                                {team.install_count.toLocaleString()}
                            </p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-500">Rating</p>
                            <p className="flex items-center gap-1 text-sm font-medium text-gray-200">
                                <Star className="h-3.5 w-3.5 text-amber-400" />
                                {team.rating_avg.toFixed(1)}
                            </p>
                        </div>
                    </div>

                    {/* Tags */}
                    {team.marketplace_tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                            {team.marketplace_tags.map((tag) => (
                                <span key={tag} className="rounded-md bg-surface-overlay px-2 py-0.5 text-xs text-gray-400">
                                    {tag}
                                </span>
                            ))}
                        </div>
                    )}

                    {/* README */}
                    {team.marketplace_readme && (
                        <div className="rounded-lg border border-border bg-surface-card p-4">
                            <div
                                className="prose prose-invert prose-sm max-w-none text-gray-300"
                                dangerouslySetInnerHTML={{
                                    __html: team.marketplace_readme
                                        .replace(/^### (.*$)/gm, '<h4 class="text-gray-200 text-sm font-semibold mt-3 mb-1">$1</h4>')
                                        .replace(/^## (.*$)/gm, '<h3 class="text-gray-100 text-sm font-bold mt-4 mb-1">$1</h3>')
                                        .replace(/^# (.*$)/gm, '<h2 class="text-gray-100 text-base font-bold mt-4 mb-2">$1</h2>')
                                        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                                        .replace(/\*(.*?)\*/g, '<em>$1</em>')
                                        .replace(/`(.*?)`/g, '<code class="rounded bg-surface-overlay px-1 py-0.5 text-[11px] text-brand-primary">$1</code>')
                                        .replace(/^- (.*$)/gm, '<li class="ml-4 list-disc text-xs text-gray-400">$1</li>')
                                        .replace(/\n/g, '<br />'),
                                }}
                            />
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between border-t border-border px-5 py-3 shrink-0">
                    <p className="text-xs text-gray-500">
                        Installing will clone this team and its {agentCount} agent{agentCount !== 1 ? 's' : ''} into your workspace.
                    </p>
                    <button
                        type="button"
                        onClick={() => onInstall(team)}
                        disabled={isInstalling}
                        className="flex items-center gap-1.5 rounded-lg bg-brand-primary px-4 py-2 text-xs font-semibold text-black transition-colors hover:bg-brand-hover disabled:opacity-50"
                    >
                        {isInstalling ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                            <Download className="h-3.5 w-3.5" />
                        )}
                        Install Team
                    </button>
                </div>
            </div>
        </div>
    )
}

function getAgentCount(team: Team): number {
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
    if ('worker_agent_ids' in config && Array.isArray(config.worker_agent_ids)) config.worker_agent_ids.forEach(id => ids.add(id))
    if ('agent_ids' in config && Array.isArray(config.agent_ids)) config.agent_ids.forEach((id: string) => ids.add(id))
    return ids.size || 1
}
