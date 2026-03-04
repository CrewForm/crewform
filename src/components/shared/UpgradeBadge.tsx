// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { Sparkles } from 'lucide-react'
import { useEEFeature } from '@/lib/featureFlags'
import type { EEGateProps } from '@/lib/featureFlags'

/**
 * UpgradeBadge — shown inline when an EE feature is not available.
 * Shows the minimum plan required (Pro / Team / Enterprise).
 */
export function UpgradeBadge({ label }: { label?: string }) {
    return (
        <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-violet-500/20 to-indigo-500/20 border border-violet-500/30 px-2.5 py-0.5 text-xs font-medium text-violet-300">
            <Sparkles className="h-3 w-3" />
            {label ?? 'Pro'}
        </span>
    )
}

/**
 * UpgradeCard — larger card shown in place of a locked feature section.
 * Shows the feature name, description, and minimum plan required.
 */
export function UpgradeCard({
    title,
    description,
    planLabel = 'Pro',
}: {
    title: string
    description: string
    planLabel?: string
}) {
    return (
        <div className="rounded-xl border border-dashed border-violet-500/30 bg-violet-500/5 p-6 text-center">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-violet-500/20">
                <Sparkles className="h-5 w-5 text-violet-400" />
            </div>
            <h3 className="text-sm font-semibold text-gray-200">{title}</h3>
            <p className="mt-1 text-xs text-gray-400">{description}</p>
            <a
                href="https://crewform.tech/pricing"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-1 rounded-lg bg-violet-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-violet-500"
            >
                <Sparkles className="h-3.5 w-3.5" />
                Upgrade to {planLabel}
            </a>
        </div>
    )
}

/**
 * EEGate — wrapper component that conditionally renders children
 * based on whether an EE feature is enabled for the workspace.
 *
 * Automatically derives the correct plan label for the fallback.
 */
export function EEGate({ workspaceId, feature, children, fallback }: EEGateProps) {
    const { enabled, isLoading } = useEEFeature(workspaceId, feature)

    if (isLoading) return null

    if (!enabled) {
        return fallback ? <>{fallback}</> : null
    }

    return <>{children}</>
}
