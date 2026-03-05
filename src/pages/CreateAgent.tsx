// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Check } from 'lucide-react'
import { useWorkspace } from '@/hooks/useWorkspace'
import { useCreateAgent } from '@/hooks/useCreateAgent'
import { useApiKeys } from '@/hooks/useApiKeys'
import { TemplateSelector } from '@/components/agents/TemplateSelector'
import { AgentForm } from '@/components/agents/AgentForm'
import { AgentReview } from '@/components/agents/AgentReview'
import type { AgentFormData } from '@/lib/agentSchema'
import { inferProviderFromModel } from '@/lib/agentSchema'
import { cn } from '@/lib/utils'

type WizardStep = 'template' | 'configure' | 'review'

const steps: { key: WizardStep; label: string; number: number }[] = [
    { key: 'template', label: 'Template', number: 1 },
    { key: 'configure', label: 'Configure', number: 2 },
    { key: 'review', label: 'Review', number: 3 },
]

export function CreateAgent() {
    const navigate = useNavigate()
    const { workspaceId } = useWorkspace()
    const createAgent = useCreateAgent()
    const { keys } = useApiKeys(workspaceId)

    // Derive active provider IDs from API keys
    const activeProviders = useMemo(
        () => keys.filter((k) => k.is_active && k.is_valid).map((k) => k.provider),
        [keys],
    )

    const [step, setStep] = useState<WizardStep>('template')
    const [formData, setFormData] = useState<AgentFormData | null>(null)

    const currentStepIndex = steps.findIndex((s) => s.key === step)

    function handleTemplateSelect(defaults: AgentFormData) {
        setFormData(defaults)
        setStep('configure')
    }

    function handleFormSubmit(data: AgentFormData) {
        setFormData(data)
        setStep('review')
    }

    function handleCreate() {
        if (!workspaceId || !formData) return

        createAgent.mutate(
            {
                workspace_id: workspaceId,
                name: formData.name,
                description: formData.description,
                model: formData.model,
                provider: inferProviderFromModel(formData.model),
                system_prompt: formData.system_prompt,
                temperature: formData.temperature,
                max_tokens: formData.max_tokens,
                tags: formData.tags,
                tools: formData.tools,
                fallback_model: formData.fallback_model,
            },
            {
                onSuccess: () => {
                    navigate('/agents', { replace: true })
                },
            },
        )
    }

    return (
        <div className="p-6 lg:p-8">
            {/* Header */}
            <div className="mb-8 flex items-center gap-3">
                <button
                    type="button"
                    onClick={() => navigate('/agents')}
                    className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-surface-elevated hover:text-gray-200"
                    aria-label="Back to agents"
                >
                    <ArrowLeft className="h-5 w-5" />
                </button>
                <h1 className="text-2xl font-semibold text-gray-100">Create Agent</h1>
            </div>

            {/* Step indicator */}
            <div className="mb-8 flex items-center gap-2">
                {steps.map((s, i) => (
                    <div key={s.key} className="flex items-center gap-2">
                        <div
                            className={cn(
                                'flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-colors',
                                i < currentStepIndex && 'bg-status-success text-white',
                                i === currentStepIndex && 'bg-brand-primary text-white',
                                i > currentStepIndex && 'bg-surface-elevated text-gray-500',
                            )}
                        >
                            {i < currentStepIndex ? <Check className="h-4 w-4" /> : s.number}
                        </div>
                        <span
                            className={cn(
                                'hidden text-sm font-medium sm:inline',
                                i === currentStepIndex ? 'text-gray-200' : 'text-gray-500',
                            )}
                        >
                            {s.label}
                        </span>
                        {i < steps.length - 1 && (
                            <div
                                className={cn(
                                    'mx-2 h-px w-8 sm:w-12',
                                    i < currentStepIndex ? 'bg-status-success' : 'bg-border',
                                )}
                            />
                        )}
                    </div>
                ))}
            </div>

            {/* Step content */}
            <div className="mx-auto max-w-2xl">
                {step === 'template' && (
                    <TemplateSelector onSelect={handleTemplateSelect} />
                )}

                {step === 'configure' && formData && (
                    <AgentForm
                        initialData={formData}
                        onSubmit={handleFormSubmit}
                        onBack={() => setStep('template')}
                        activeProviders={activeProviders}
                        workspaceId={workspaceId}
                    />
                )}

                {step === 'review' && formData && (
                    <AgentReview
                        data={formData}
                        onBack={() => setStep('configure')}
                        onCreate={handleCreate}
                        isCreating={createAgent.isPending}
                        error={createAgent.error?.message ?? null}
                    />
                )}
            </div>
        </div>
    )
}
