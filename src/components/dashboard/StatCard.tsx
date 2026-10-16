// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

interface StatCardProps {
    label: string
    value: string | number
    icon: LucideIcon
    accentColor: string
    isLoading?: boolean
}

/**
 * Stat card for the dashboard grid.
 * Shows icon, label, and large value with color-coded left accent.
 */
export function StatCard({ label, value, icon: Icon, accentColor, isLoading }: StatCardProps) {
    if (isLoading) {
        return (
            <div className="rounded-lg border border-border bg-surface-card p-5">
                <Skeleton className="mb-3 h-4 w-24" />
                <Skeleton className="h-9 w-16" />
            </div>
        )
    }

    return (
        <div className={cn(
            'rounded-lg border border-border bg-surface-card p-5 transition-all hover:shadow-md',
            'border-l-4',
            accentColor,
        )}>
            <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-400">{label}</p>
                <Icon className="h-4.5 w-4.5 text-gray-600" />
            </div>
            <p className="text-3xl font-bold text-gray-100">{value}</p>
        </div>
    )
}
