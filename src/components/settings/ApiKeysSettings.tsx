// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useState } from 'react'
import { Info, Key } from 'lucide-react'
import { useWorkspace } from '@/hooks/useWorkspace'
import { useApiKeys } from '@/hooks/useApiKeys'
import { useSaveApiKey } from '@/hooks/useSaveApiKey'
import { useRemoveApiKey } from '@/hooks/useRemoveApiKey'
import { useToggleProvider } from '@/hooks/useToggleProvider'
import { ProviderKeyCard } from '@/components/settings/ProviderKeyCard'
import { ProviderDetailModal } from '@/components/settings/ProviderDetailModal'
import type { ProviderConfig } from '@/components/settings/ProviderKeyCard'
import { MODEL_OPTIONS } from '@/lib/agentSchema'
import { Skeleton } from '@/components/ui/skeleton'

/** Build PROVIDERS config by merging static metadata with models from agentSchema */
const PROVIDERS: ProviderConfig[] = [
    {
        id: 'anthropic',
        name: 'Anthropic',
        prefix: 'sk-ant-',
        color: 'text-orange-400',
        bgColor: 'bg-orange-500/10',
        borderColor: 'border-border',
    },
    {
        id: 'openai',
        name: 'OpenAI',
        prefix: 'sk-',
        color: 'text-green-400',
        bgColor: 'bg-green-500/10',
        borderColor: 'border-border',
    },
    {
        id: 'google',
        name: 'Google',
        prefix: 'AI',
        color: 'text-blue-400',
        bgColor: 'bg-blue-500/10',
        borderColor: 'border-border',
    },
    {
        id: 'openrouter',
        name: 'OpenRouter',
        prefix: 'sk-or-',
        color: 'text-purple-400',
        bgColor: 'bg-purple-500/10',
        borderColor: 'border-border',
    },
    {
        id: 'mistral',
        name: 'Mistral',
        prefix: '',
        color: 'text-amber-400',
        bgColor: 'bg-amber-500/10',
        borderColor: 'border-border',
    },
    {
        id: 'groq',
        name: 'Groq',
        prefix: 'gsk_',
        color: 'text-cyan-400',
        bgColor: 'bg-cyan-500/10',
        borderColor: 'border-border',
    },
    {
        id: 'cohere',
        name: 'Cohere',
        prefix: '',
        color: 'text-rose-400',
        bgColor: 'bg-rose-500/10',
        borderColor: 'border-border',
    },
    {
        id: 'together',
        name: 'Together AI',
        prefix: '',
        color: 'text-indigo-400',
        bgColor: 'bg-indigo-500/10',
        borderColor: 'border-border',
    },
    {
        id: 'nvidia',
        name: 'NVIDIA',
        prefix: 'nvapi-',
        color: 'text-lime-400',
        bgColor: 'bg-lime-500/10',
        borderColor: 'border-border',
    },
    {
        id: 'huggingface',
        name: 'Hugging Face',
        prefix: 'hf_',
        color: 'text-yellow-400',
        bgColor: 'bg-yellow-500/10',
        borderColor: 'border-border',
    },
    {
        id: 'venice',
        name: 'Venice',
        prefix: '',
        color: 'text-teal-400',
        bgColor: 'bg-teal-500/10',
        borderColor: 'border-border',
    },
    {
        id: 'minimax',
        name: 'MiniMax',
        prefix: '',
        color: 'text-pink-400',
        bgColor: 'bg-pink-500/10',
        borderColor: 'border-border',
    },
    {
        id: 'moonshot',
        name: 'Moonshot',
        prefix: '',
        color: 'text-sky-400',
        bgColor: 'bg-sky-500/10',
        borderColor: 'border-border',
    },
    {
        id: 'perplexity',
        name: 'Perplexity',
        prefix: 'pplx-',
        color: 'text-violet-400',
        bgColor: 'bg-violet-500/10',
        borderColor: 'border-border',
    },
    {
        id: 'serper',
        name: 'Serper (Web Search)',
        prefix: '',
        color: 'text-emerald-400',
        bgColor: 'bg-emerald-500/10',
        borderColor: 'border-border',
    },
].map((p) => {
    const modelGroup = MODEL_OPTIONS.find(
        (g) => g.provider.toLowerCase() === p.id.toLowerCase(),
    )
    return {
        ...p,
        models: modelGroup
            ? modelGroup.models.map((m) => ({ value: m.value, label: m.label }))
            : [],
    }
})

/**
 * API Keys settings section.
 * 3-column grid split into Active / Inactive sections, with a detail modal for editing.
 */
export function ApiKeysSettings() {
    const { workspaceId } = useWorkspace()
    const { keysByProvider, isLoading } = useApiKeys(workspaceId)
    const saveMutation = useSaveApiKey()
    const removeMutation = useRemoveApiKey()
    const toggleMutation = useToggleProvider()

    const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null)

    function handleSave(provider: string, rawKey: string) {
        if (!workspaceId) return
        const hint = rawKey.slice(-4)
        saveMutation.mutate({
            workspace_id: workspaceId,
            provider,
            encrypted_key: rawKey,
            key_hint: hint,
            is_valid: true,
        })
    }

    function handleRemove(keyId: string) {
        if (!workspaceId) return
        removeMutation.mutate({ id: keyId, workspaceId })
    }

    function handleToggleActive(keyId: string, isActive: boolean) {
        if (!workspaceId) return
        toggleMutation.mutate({ id: keyId, isActive, workspaceId })
    }

    // Split providers into active and inactive
    const activeProviders = PROVIDERS.filter((p) => {
        const key = keysByProvider.get(p.id)
        return key?.is_active
    })
    const inactiveProviders = PROVIDERS.filter((p) => {
        const key = keysByProvider.get(p.id)
        return !key?.is_active
    })

    // Current selected provider for modal
    const selectedProvider = selectedProviderId
        ? PROVIDERS.find((p) => p.id === selectedProviderId) ?? null
        : null
    const selectedKey = selectedProviderId
        ? keysByProvider.get(selectedProviderId)
        : undefined

    if (isLoading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-20 w-full rounded-lg" />
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Skeleton className="h-28 w-full rounded-xl" />
                    <Skeleton className="h-28 w-full rounded-xl" />
                    <Skeleton className="h-28 w-full rounded-xl" />
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-8">
            {/* Info banner */}
            <div className="flex items-start gap-3 rounded-lg border border-brand-primary/20 bg-brand-muted/30 px-4 py-3">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-primary" />
                <div>
                    <p className="text-sm font-medium text-gray-200">What is BYOK?</p>
                    <p className="mt-0.5 text-xs text-gray-400">
                        Bring Your Own Key — use your own API keys for full cost transparency and control.
                        Keys are encrypted at rest with AES-256-GCM and never logged.
                        Click any provider to configure its API key and toggle it active.
                    </p>
                </div>
            </div>

            {/* Active Providers */}
            {activeProviders.length > 0 && (
                <section>
                    <div className="mb-4 flex items-center gap-2">
                        <Key className="h-4 w-4 text-green-400" />
                        <h3 className="text-sm font-semibold text-gray-200">Active Providers</h3>
                        <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-400">
                            {activeProviders.length}
                        </span>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        {activeProviders.map((provider) => (
                            <ProviderKeyCard
                                key={provider.id}
                                provider={provider}
                                existingKey={keysByProvider.get(provider.id)}
                                onClick={() => setSelectedProviderId(provider.id)}
                            />
                        ))}
                    </div>
                </section>
            )}

            {/* Inactive Providers */}
            {inactiveProviders.length > 0 && (
                <section>
                    <div className="mb-4 flex items-center gap-2">
                        <Key className="h-4 w-4 text-gray-500" />
                        <h3 className="text-sm font-semibold text-gray-200">
                            {activeProviders.length > 0 ? 'Inactive Providers' : 'All Providers'}
                        </h3>
                        <span className="rounded-full bg-gray-500/10 px-2 py-0.5 text-xs font-medium text-gray-500">
                            {inactiveProviders.length}
                        </span>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        {inactiveProviders.map((provider) => (
                            <ProviderKeyCard
                                key={provider.id}
                                provider={provider}
                                existingKey={keysByProvider.get(provider.id)}
                                onClick={() => setSelectedProviderId(provider.id)}
                            />
                        ))}
                    </div>
                </section>
            )}

            {/* Detail Modal */}
            <ProviderDetailModal
                provider={selectedProvider}
                existingKey={selectedKey}
                onClose={() => setSelectedProviderId(null)}
                onSave={(key) => {
                    if (selectedProviderId) handleSave(selectedProviderId, key)
                }}
                onRemove={() => {
                    if (selectedKey) handleRemove(selectedKey.id)
                }}
                onToggleActive={(isActive) => {
                    if (selectedKey) handleToggleActive(selectedKey.id, isActive)
                }}
                isSaving={saveMutation.isPending}
                isRemoving={removeMutation.isPending}
                isToggling={toggleMutation.isPending}
            />
        </div>
    )
}
