// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { Download, Bot, Users2, Clock } from 'lucide-react'
import type { WorkflowTemplate } from '@/types'

interface TemplateCardProps {
    template: WorkflowTemplate
    onClick: (template: WorkflowTemplate) => void
}

const categoryColors: Record<string, string> = {
    coaching: 'bg-green-500/10 text-green-400',
    research: 'bg-blue-500/10 text-blue-400',
    content: 'bg-purple-500/10 text-purple-400',
    devops: 'bg-orange-500/10 text-orange-400',
    reporting: 'bg-cyan-500/10 text-cyan-400',
    general: 'bg-gray-500/10 text-gray-400',
}

export function TemplateCard({ template, onClick }: TemplateCardProps) {
    const def = template.template_definition
    const agentCount = def.agents.length
    const hasTeam = !!def.team
    const hasTrigger = !!def.trigger
    const varCount = template.variables.length
    const catClass = categoryColors[template.category] ?? categoryColors.general

    return (
        <button
            type="button"
            onClick={() => onClick(template)}
            className="group w-full rounded-xl border border-border bg-surface-card p-5 text-left transition-all hover:border-brand-primary/40 hover:shadow-lg hover:shadow-brand-primary/5"
        >
            {/* Header */}
            <div className="mb-3 flex items-start justify-between">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-xl" role="img" aria-label={template.name}>
                            {template.icon}
                        </span>
                        <h3 className="truncate text-base font-semibold text-gray-100 group-hover:text-brand-primary transition-colors">
                            {template.name}
                        </h3>
                    </div>
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${catClass}`}>
                        {template.category}
                    </span>
                </div>
            </div>

            {/* Description */}
            <p className="mb-3 line-clamp-2 text-sm text-gray-400">
                {template.description}
            </p>

            {/* What's included */}
            <div className="mb-3 flex flex-wrap gap-2">
                <span className="flex items-center gap-1 rounded-md bg-surface-overlay px-2 py-0.5 text-xs text-gray-400">
                    <Bot className="h-3 w-3" />
                    {agentCount} agent{agentCount !== 1 ? 's' : ''}
                </span>
                {hasTeam && (
                    <span className="flex items-center gap-1 rounded-md bg-surface-overlay px-2 py-0.5 text-xs text-gray-400">
                        <Users2 className="h-3 w-3" />
                        Team
                    </span>
                )}
                {hasTrigger && (
                    <span className="flex items-center gap-1 rounded-md bg-surface-overlay px-2 py-0.5 text-xs text-gray-400">
                        <Clock className="h-3 w-3" />
                        {def.trigger?.type === 'cron' ? 'Scheduled' : 'Webhook'}
                    </span>
                )}
            </div>

            {/* Stats */}
            <div className="flex items-center gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                    <Download className="h-3.5 w-3.5" />
                    {template.install_count.toLocaleString()}
                </span>
                <span className="text-gray-600">
                    {varCount} variable{varCount !== 1 ? 's' : ''}
                </span>
            </div>
        </button>
    )
}
