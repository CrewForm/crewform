// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import type { LucideIcon } from 'lucide-react'
import { Inbox } from 'lucide-react'

interface EmptyStateProps {
    icon?: LucideIcon
    title: string
    description?: string
    action?: {
        label: string
        onClick: () => void
    }
}

export function EmptyState({
    icon: Icon = Inbox,
    title,
    description,
    action,
}: EmptyStateProps) {
    return (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-surface-border py-16">
            <Icon className="mb-3 h-10 w-10 text-gray-500" />
            <p className="text-sm font-medium text-gray-300">{title}</p>
            {description && (
                <p className="mt-1 max-w-sm text-center text-xs text-gray-500">{description}</p>
            )}
            {action && (
                <button
                    onClick={action.onClick}
                    className="mt-4 rounded-md bg-brand-primary px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-brand-primary/80"
                >
                    {action.label}
                </button>
            )}
        </div>
    )
}
