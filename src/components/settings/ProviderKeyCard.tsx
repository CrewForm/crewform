// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import type { ApiKey } from '@/types'
import { cn } from '@/lib/utils'

export interface ProviderModel {
    value: string
    label: string
}

export interface ProviderConfig {
    id: string
    name: string
    prefix: string
    color: string
    bgColor: string
    borderColor: string
    models: ProviderModel[]
}

interface ProviderKeyCardProps {
    provider: ProviderConfig
    existingKey: ApiKey | undefined
    onClick: () => void
}

/**
 * Compact provider card for the 3-column grid.
 * Shows provider name, active/inactive badge, and model count.
 * Clicking opens the detail modal.
 */
export function ProviderKeyCard({ provider, existingKey, onClick }: ProviderKeyCardProps) {
    const isConfigured = !!existingKey
    const isActive = existingKey?.is_active ?? false

    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'group w-full rounded-xl border bg-surface-card p-5 text-left transition-all hover:shadow-lg hover:shadow-brand-primary/5',
                isActive
                    ? 'border-green-500/30 hover:border-green-500/50'
                    : 'border-border hover:border-brand-primary/40',
            )}
        >
            {/* Header */}
            <div className="mb-3 flex items-start justify-between">
                <div className="flex items-center gap-3">
                    <div className={cn(
                        'flex h-10 w-10 items-center justify-center rounded-lg text-sm font-bold',
                        provider.bgColor,
                        provider.color,
                    )}>
                        {provider.name.charAt(0)}
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold text-gray-200 group-hover:text-brand-primary transition-colors">
                            {provider.name}
                        </h3>
                        {isConfigured ? (
                            <span className="text-xs text-gray-500">
                                ••••{existingKey.key_hint}
                            </span>
                        ) : (
                            <span className="text-xs text-gray-600">Not configured</span>
                        )}
                    </div>
                </div>

                {/* Status badge */}
                <span className={cn(
                    'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                    isActive
                        ? 'bg-green-500/10 text-green-400'
                        : 'bg-gray-500/10 text-gray-500',
                )}>
                    {isActive ? 'Active' : 'Inactive'}
                </span>
            </div>

            {/* Models tag */}
            <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-md bg-surface-overlay px-2 py-0.5 text-xs text-gray-400">
                    {provider.models.length} Available Model{provider.models.length !== 1 ? 's' : ''}
                </span>
            </div>
        </button>
    )
}
