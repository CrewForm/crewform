// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useState } from 'react'
import { Loader2, Download, CheckCircle2, Bot, Users2, Clock, Variable } from 'lucide-react'
import { SlidePanel } from '@/components/shared/SlidePanel'
import { useWorkspace } from '@/hooks/useWorkspace'
import { useInstallTemplate } from '@/hooks/useWorkflowTemplates'
import type { WorkflowTemplate, TemplateVariable } from '@/types'

interface TemplateInstallModalProps {
    template: WorkflowTemplate | null
    onClose: () => void
    onSuccess?: (result: { agents: unknown[]; teamId: string | null; triggerId: string | null }) => void
}

export function TemplateInstallModal({ template, onClose, onSuccess }: TemplateInstallModalProps) {
    const { workspaceId } = useWorkspace()
    const installMutation = useInstallTemplate()
    const [values, setValues] = useState<Record<string, string>>({})
    const [installed, setInstalled] = useState(false)

    if (!template) return null

    const def = template.template_definition
    const vars = template.variables

    // Initialize defaults
    const getVal = (v: TemplateVariable) => values[v.key] ?? v.default

    const allRequiredFilled = vars
        .filter((v) => v.required)
        .every((v) => getVal(v).trim().length > 0)

    const handleInstall = () => {
        if (!workspaceId) return

        // Build variable values map
        const varMap: Record<string, string> = {}
        for (const v of vars) {
            varMap[v.key] = getVal(v)
        }

        installMutation.mutate(
            { templateId: template.id, workspaceId, variables: varMap },
            {
                onSuccess: (result) => {
                    setInstalled(true)
                    onSuccess?.(result)
                },
            },
        )
    }

    // Success state
    if (installed) {
        return (
            <SlidePanel open onClose={onClose}>
                <div className="flex flex-col items-center justify-center py-16 text-center">
                    <CheckCircle2 className="mb-4 h-16 w-16 text-green-400" />
                    <h2 className="text-xl font-bold text-gray-100">Template Installed!</h2>
                    <p className="mt-2 text-sm text-gray-400">
                        Created {def.agents.length} agent{def.agents.length !== 1 ? 's' : ''}
                        {def.team ? ', 1 team' : ''}
                        {def.trigger ? ', 1 trigger' : ''} in your workspace.
                    </p>
                    <button
                        type="button"
                        onClick={onClose}
                        className="mt-6 rounded-lg bg-brand-primary px-6 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-brand-primary/90"
                    >
                        Done
                    </button>
                </div>
            </SlidePanel>
        )
    }

    return (
        <SlidePanel
            open
            onClose={onClose}
            footer={
                <button
                    type="button"
                    onClick={handleInstall}
                    disabled={!allRequiredFilled || installMutation.isPending}
                    className="w-full rounded-lg bg-brand-primary px-4 py-3 text-sm font-semibold text-black transition-colors hover:bg-brand-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {installMutation.isPending ? (
                        <><Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Installing...</>
                    ) : (
                        <><Download className="mr-2 inline h-4 w-4" /> Install Template</>
                    )}
                </button>
            }
        >
            {/* Header */}
            <div className="mb-6">
                <div className="flex items-center gap-3 mb-2">
                    <span className="text-3xl">{template.icon}</span>
                    <div>
                        <h2 className="text-xl font-bold text-gray-100">{template.name}</h2>
                        <p className="text-sm text-gray-400">{template.category}</p>
                    </div>
                </div>
                <p className="text-sm leading-relaxed text-gray-300">{template.description}</p>
            </div>

            {/* What will be created */}
            <section className="mb-6">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
                    What will be created
                </h3>
                <div className="space-y-2">
                    {def.agents.map((agent, i) => (
                        <div key={i} className="flex items-center gap-3 rounded-lg bg-surface-overlay p-3">
                            <Bot className="h-4 w-4 text-brand-primary" />
                            <div>
                                <p className="text-sm font-medium text-gray-200">{agent.name}</p>
                                <p className="text-xs text-gray-500">{agent.provider} · {agent.model}</p>
                            </div>
                        </div>
                    ))}
                    {def.team && (
                        <div className="flex items-center gap-3 rounded-lg bg-surface-overlay p-3">
                            <Users2 className="h-4 w-4 text-purple-400" />
                            <div>
                                <p className="text-sm font-medium text-gray-200">{def.team.name}</p>
                                <p className="text-xs text-gray-500">{def.team.mode} team · {def.team.steps.length} steps</p>
                            </div>
                        </div>
                    )}
                    {def.trigger && (
                        <div className="flex items-center gap-3 rounded-lg bg-surface-overlay p-3">
                            <Clock className="h-4 w-4 text-blue-400" />
                            <div>
                                <p className="text-sm font-medium text-gray-200">
                                    {def.trigger.type === 'cron' ? 'Scheduled Trigger' : 'Webhook Trigger'}
                                </p>
                                {def.trigger.cron_expression && (
                                    <p className="font-mono text-xs text-gray-500">{def.trigger.cron_expression}</p>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </section>

            {/* Error */}
            {installMutation.isError && (
                <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                    {installMutation.error instanceof Error ? installMutation.error.message : 'Installation failed. Please try again.'}
                </div>
            )}

            {/* Variable Form */}
            {vars.length > 0 && (
                <section>
                    <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-gray-500">
                        <Variable className="h-4 w-4" />
                        Configure Variables
                    </h3>
                    <div className="space-y-4">
                        {vars.map((v) => (
                            <div key={v.key}>
                                <label className="mb-1.5 block text-sm font-medium text-gray-300">
                                    {v.label}
                                    {v.required && <span className="ml-1 text-red-400">*</span>}
                                </label>
                                <input
                                    type={v.type === 'number' ? 'number' : 'text'}
                                    value={getVal(v)}
                                    onChange={(e) => setValues({ ...values, [v.key]: e.target.value })}
                                    placeholder={v.placeholder}
                                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-gray-200 placeholder-gray-500 outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary"
                                />
                            </div>
                        ))}
                    </div>
                </section>
            )}
        </SlidePanel>
    )
}
