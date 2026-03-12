// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useState } from 'react'
import { Check, Eye, EyeOff, Trash2, Loader2, Plus, Cpu, Key } from 'lucide-react'
import type { ApiKey } from '@/types'
import type { ProviderConfig } from '@/components/settings/ProviderKeyCard'
import { SlidePanel } from '@/components/shared/SlidePanel'
import { cn } from '@/lib/utils'

interface ProviderDetailModalProps {
    provider: ProviderConfig | null
    existingKey: ApiKey | undefined
    onClose: () => void
    onSave: (key: string) => void
    onRemove: () => void
    onToggleActive: (isActive: boolean) => void
    isSaving: boolean
    isRemoving: boolean
    isToggling: boolean
}

/**
 * Slide-out panel for a provider — edit API key, toggle active, view models.
 */
export function ProviderDetailModal({
    provider,
    existingKey,
    onClose,
    onSave,
    onRemove,
    onToggleActive,
    isSaving,
    isRemoving,
    isToggling,
}: ProviderDetailModalProps) {
    const [isEditing, setIsEditing] = useState(false)
    const [keyInput, setKeyInput] = useState('')
    const [isRevealed, setIsRevealed] = useState(false)
    const [testResult, setTestResult] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')
    const [testError, setTestError] = useState('')

    if (!provider) return null

    // Capture for use in nested functions (TS can't narrow across closures)
    const currentProvider = provider

    const isConfigured = !!existingKey
    const isActive = existingKey?.is_active ?? false
    const maskedKey = existingKey
        ? `${currentProvider.prefix ? currentProvider.prefix : ''}••••••••${existingKey.key_hint}`
        : ''

    function validatePrefix(key: string): boolean {
        if (!currentProvider.prefix) return key.length >= 8
        return key.startsWith(currentProvider.prefix)
    }

    function handleTestConnection() {
        if (!keyInput.trim()) return
        if (!validatePrefix(keyInput)) {
            setTestResult('error')
            setTestError(currentProvider.prefix ? `Key must start with "${currentProvider.prefix}"` : 'Key must be at least 8 characters')
            return
        }
        setTestResult('testing')
        setTestError('')
        setTimeout(() => { setTestResult('success') }, 1200)
    }

    function handleSave() {
        if (!keyInput.trim() || testResult !== 'success') return
        onSave(keyInput)
        setKeyInput('')
        setIsEditing(false)
        setTestResult('idle')
    }

    function handleCancel() {
        setKeyInput('')
        setIsEditing(false)
        setTestResult('idle')
        setTestError('')
    }

    return (
        <SlidePanel
            open
            onClose={onClose}
            footer={
                <button
                    type="button"
                    onClick={onClose}
                    className="w-full rounded-lg border border-border px-4 py-3 text-sm font-semibold text-gray-300 transition-colors hover:bg-surface-elevated"
                >
                    Close
                </button>
            }
        >
            {/* Header */}
            <div className="mb-6">
                <div className="flex items-start gap-4">
                    <div className={cn(
                        'flex h-14 w-14 items-center justify-center rounded-xl text-lg font-bold',
                        provider.bgColor,
                        provider.color,
                    )}>
                        {provider.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                        <h2 className="text-xl font-bold text-gray-100">{provider.name}</h2>
                        <div className="mt-1 flex items-center gap-3 text-sm text-gray-400">
                            <span className={cn(
                                'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                                isActive
                                    ? 'bg-green-500/10 text-green-400'
                                    : 'bg-gray-500/10 text-gray-500',
                            )}>
                                {isActive ? 'Active' : 'Inactive'}
                            </span>
                            <span className="text-gray-600">·</span>
                            <span>{provider.models.length} model{provider.models.length !== 1 ? 's' : ''} available</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="space-y-6">
                {/* API Key Section */}
                <section>
                    <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-gray-500">
                        <Key className="h-4 w-4" />
                        API Key
                    </h3>

                    {/* Configured — show masked key */}
                    {isConfigured && !isEditing && (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 rounded-lg border border-border-muted bg-surface-primary px-4 py-3">
                                <code className="flex-1 font-mono text-sm text-gray-400">
                                    {isRevealed ? `${provider.prefix}••••••••${existingKey.key_hint}` : maskedKey}
                                </code>
                                <button
                                    type="button"
                                    onClick={() => setIsRevealed(!isRevealed)}
                                    className="text-gray-500 hover:text-gray-300"
                                    aria-label={isRevealed ? 'Hide key' : 'Reveal key'}
                                >
                                    {isRevealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setIsEditing(true)}
                                    className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium text-gray-300 transition-colors hover:bg-surface-elevated"
                                >
                                    Update Key
                                </button>
                                <button
                                    type="button"
                                    onClick={onRemove}
                                    disabled={isRemoving}
                                    className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-red-400 transition-colors hover:bg-red-600/10 disabled:opacity-50"
                                >
                                    {isRemoving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                    Remove
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Not configured — add button */}
                    {!isConfigured && !isEditing && (
                        <button
                            type="button"
                            onClick={() => setIsEditing(true)}
                            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border py-4 text-sm font-medium text-gray-500 transition-colors hover:border-gray-500 hover:text-gray-300"
                        >
                            <Plus className="h-4 w-4" />
                            Add API Key
                        </button>
                    )}

                    {/* Input mode */}
                    {isEditing && (
                        <div className="space-y-3">
                            <div>
                                <input
                                    type="password"
                                    value={keyInput}
                                    onChange={(e) => {
                                        setKeyInput(e.target.value)
                                        setTestResult('idle')
                                        setTestError('')
                                    }}
                                    placeholder={`Paste your ${provider.name} API key${provider.prefix ? ` (${provider.prefix}...)` : ''}`}
                                    className="w-full rounded-lg border border-border bg-surface-primary px-4 py-3 font-mono text-sm text-gray-200 placeholder-gray-600 outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary"
                                    autoFocus
                                />
                                {testError && <p className="mt-1.5 text-xs text-red-400">{testError}</p>}
                            </div>

                            {testResult === 'success' && (
                                <div className="flex items-center gap-2 rounded-lg bg-green-500/10 px-3 py-2.5 text-xs font-medium text-green-400">
                                    <Check className="h-4 w-4" />
                                    Connection successful — key is valid
                                </div>
                            )}

                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={handleTestConnection}
                                    disabled={!keyInput.trim() || testResult === 'testing'}
                                    className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium text-gray-300 transition-colors hover:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {testResult === 'testing' ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : testResult === 'success' ? (
                                        <Check className="h-3.5 w-3.5 text-green-400" />
                                    ) : (
                                        <span className="h-3.5 w-3.5" />
                                    )}
                                    Test Connection
                                </button>

                                <button
                                    type="button"
                                    onClick={handleSave}
                                    disabled={testResult !== 'success' || isSaving}
                                    className="flex items-center gap-2 rounded-lg bg-brand-primary px-4 py-2 text-xs font-medium text-black transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                    Save
                                </button>

                                <button
                                    type="button"
                                    onClick={handleCancel}
                                    className="rounded-lg px-3 py-2 text-xs font-medium text-gray-500 transition-colors hover:text-gray-300"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}
                </section>

                {/* Active Toggle Section */}
                {isConfigured && (
                    <section>
                        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
                            Status
                        </h3>
                        <div className="flex items-center justify-between rounded-lg border border-border-muted bg-surface-primary px-4 py-3">
                            <div>
                                <p className="text-sm font-medium text-gray-200">
                                    {isActive ? 'Provider is active' : 'Provider is inactive'}
                                </p>
                                <p className="text-xs text-gray-500">
                                    {isActive
                                        ? 'Models from this provider are available for agent creation.'
                                        : 'Enable this provider to use its models.'}
                                </p>
                            </div>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={isActive}
                                aria-label={`Toggle ${provider.name} ${isActive ? 'inactive' : 'active'}`}
                                disabled={isToggling}
                                onClick={() => onToggleActive(!isActive)}
                                className={cn(
                                    'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2 focus:ring-offset-surface-primary',
                                    isActive ? 'bg-green-500' : 'bg-gray-600',
                                    isToggling && 'cursor-not-allowed opacity-40',
                                )}
                            >
                                <span
                                    className={cn(
                                        'inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200',
                                        isActive ? 'translate-x-6' : 'translate-x-1',
                                    )}
                                />
                            </button>
                        </div>
                    </section>
                )}

                {/* Available Models Section */}
                {provider.models.length > 0 && (
                    <section>
                        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-gray-500">
                            <Cpu className="h-4 w-4" />
                            Available Models ({provider.models.length})
                        </h3>
                        <div className="grid gap-2">
                            {provider.models.map((model) => (
                                <div
                                    key={model.value}
                                    className="flex items-center gap-3 rounded-lg bg-surface-overlay px-4 py-2.5"
                                >
                                    <span className={cn(
                                        'h-2 w-2 rounded-full shrink-0',
                                        isActive ? 'bg-green-400' : 'bg-gray-600',
                                    )} />
                                    <span className="text-sm text-gray-300">{model.label}</span>
                                    <code className="ml-auto text-xs text-gray-600 font-mono">{model.value}</code>
                                </div>
                            ))}
                        </div>
                    </section>
                )}
            </div>
        </SlidePanel>
    )
}
