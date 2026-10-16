// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { Skeleton, SkeletonCard } from '@/components/ui/skeleton'

/**
 * Full-page skeleton layout used as a loading fallback.
 * Matches the dashboard structure: header + stat cards + content area.
 */
export function PageSkeleton() {
    return (
        <div className="p-8">
            {/* Header skeleton */}
            <div className="mb-8 flex items-center gap-3">
                <Skeleton className="h-6 w-6 rounded" />
                <Skeleton className="h-7 w-40" />
            </div>

            {/* Stat cards skeleton */}
            <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div
                        key={i}
                        className="rounded-lg border border-border bg-surface-card p-6"
                    >
                        <Skeleton className="mb-3 h-3 w-24" />
                        <Skeleton className="h-8 w-16" />
                    </div>
                ))}
            </div>

            {/* Content skeleton */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
            </div>
        </div>
    )
}
