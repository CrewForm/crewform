// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { Star, Download } from 'lucide-react'
import type { Agent } from '@/types'

interface AgentCardProps {
    agent: Agent
    onClick: (agent: Agent) => void
}

const providerColors: Record<string, string> = {
    Anthropic: 'bg-amber-500/10 text-amber-400',
    OpenAI: 'bg-green-500/10 text-green-400',
    Google: 'bg-blue-500/10 text-blue-400',
    Mistral: 'bg-orange-500/10 text-orange-400',
    Groq: 'bg-purple-500/10 text-purple-400',
    Cohere: 'bg-pink-500/10 text-pink-400',
    OpenRouter: 'bg-cyan-500/10 text-cyan-400',
    Ollama: 'bg-gray-500/10 text-gray-400',
}

export function AgentCard({ agent, onClick }: AgentCardProps) {
    const providerClass = providerColors[agent.provider ?? ''] ?? 'bg-gray-500/10 text-gray-400'

    return (
        <button
            type="button"
            onClick={() => onClick(agent)}
            className="group w-full rounded-xl border border-border bg-surface-card p-5 text-left transition-all hover:border-brand-primary/40 hover:shadow-lg hover:shadow-brand-primary/5"
        >
            {/* Header */}
            <div className="mb-3 flex items-start justify-between">
                <div className="flex-1 min-w-0">
                    <h3 className="truncate text-base font-semibold text-gray-100 group-hover:text-brand-primary transition-colors">
                        {agent.name}
                    </h3>
                    <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${providerClass}`}>
                        {agent.provider}
                    </span>
                </div>
            </div>

            {/* Description */}
            <p className="mb-3 line-clamp-2 text-sm text-gray-400">
                {agent.description}
            </p>

            {/* Tags */}
            <div className="mb-3 flex flex-wrap gap-1.5">
                {agent.marketplace_tags.map((tag) => (
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
                    {agent.install_count.toLocaleString()}
                </span>
                <span className="flex items-center gap-1">
                    <Star className="h-3.5 w-3.5 text-amber-400" />
                    {agent.rating_avg.toFixed(1)}
                </span>
                <span className="ml-auto text-gray-600">{agent.model}</span>
            </div>
        </button>
    )
}
