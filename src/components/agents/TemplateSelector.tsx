// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { Layers } from 'lucide-react'
import { agentTemplates } from '@/lib/agentTemplates'
import type { AgentTemplate } from '@/lib/agentTemplates'
import type { AgentFormData } from '@/lib/agentSchema'
import { cn } from '@/lib/utils'

interface TemplateSelectorProps {
    onSelect: (defaults: AgentFormData) => void
}

/**
 * Step 1: Template selection grid.
 * Shows 5 template cards + "Start from scratch" option.
 */
export function TemplateSelector({ onSelect }: TemplateSelectorProps) {
    return (
        <div>
            <p className="mb-6 text-sm text-gray-400">
                Choose a template to get started quickly, or start from scratch.
            </p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {agentTemplates.map((template) => (
                    <TemplateCard
                        key={template.id}
                        template={template}
                        onClick={() => onSelect(template.defaults)}
                    />
                ))}

                {/* Start from scratch */}
                <button
                    type="button"
                    onClick={() =>
                        onSelect({
                            name: '',
                            description: '',
                            model: 'claude-sonnet-4-20250514',
                            system_prompt: '',
                            temperature: 0.7,
                            max_tokens: null,
                            tags: [],
                            tools: [],
                        })
                    }
                    className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-surface-card p-6 transition-colors hover:border-gray-600 hover:bg-surface-elevated"
                >
                    <Layers className="mb-3 h-8 w-8 text-gray-500" />
                    <h3 className="text-sm font-semibold text-gray-300">Start from scratch</h3>
                    <p className="mt-1 text-xs text-gray-500">Blank agent with defaults</p>
                </button>
            </div>
        </div>
    )
}

function TemplateCard({
    template,
    onClick,
}: {
    template: AgentTemplate
    onClick: () => void
}) {
    const Icon = template.icon
    const modelShort = template.defaults.model.split('/').pop() ?? template.defaults.model

    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'flex flex-col items-start rounded-lg border border-border bg-surface-card p-5 text-left transition-colors',
                'hover:border-brand-primary hover:bg-surface-elevated',
            )}
        >
            <div className="mb-3 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-muted text-brand-primary">
                    <Icon className="h-5 w-5" />
                </div>
                <div>
                    <h3 className="text-sm font-semibold text-gray-200">{template.name}</h3>
                    <p className="text-xs text-gray-500">{template.role}</p>
                </div>
            </div>
            <p className="mb-3 text-xs leading-relaxed text-gray-400">{template.description}</p>
            <span className="inline-flex items-center rounded-md border border-border bg-surface-primary px-2 py-0.5 text-xs font-medium text-gray-500">
                {modelShort}
            </span>
        </button>
    )
}
