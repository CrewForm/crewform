// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { cn } from '@/lib/utils'

/**
 * Animated skeleton loading placeholder.
 * Renders a pulsing grey bar with configurable dimensions.
 */
export function Skeleton({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn(
                'animate-pulse rounded-md bg-surface-overlay',
                className,
            )}
            {...props}
        />
    )
}

/**
 * Card-shaped skeleton for grid layouts (e.g. agent cards, stat cards).
 */
export function SkeletonCard({ className }: { className?: string }) {
    return (
        <div className={cn('rounded-lg border border-border bg-surface-card p-6', className)}>
            <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                </div>
            </div>
            <div className="mt-4 space-y-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-5/6" />
            </div>
        </div>
    )
}

/**
 * Text paragraph skeleton with varying line widths.
 */
export function SkeletonText({
    lines = 3,
    className,
}: {
    lines?: number
    className?: string
}) {
    const widths = ['w-full', 'w-5/6', 'w-4/5', 'w-3/4', 'w-2/3']

    return (
        <div className={cn('space-y-2', className)}>
            {Array.from({ length: lines }).map((_, i) => (
                <Skeleton
                    key={i}
                    className={cn('h-3', widths[i % widths.length])}
                />
            ))}
        </div>
    )
}
