// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { AlertCircle, ArrowUpRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

interface UpgradePromptProps {
    resource: string
    current: number
    limit: number
    message?: string
}

const RESOURCE_LABELS: Record<string, string> = {
    agents: 'agents',
    tasks_per_month: 'tasks this month',
    teams: 'teams',
    members: 'workspace members',
    triggers: 'triggers',
    marketplace_installs: 'marketplace installs',
}

/**
 * Inline banner that appears when the user hits a plan limit.
 * Shows current usage vs limit and a CTA to upgrade.
 */
export function UpgradePrompt({ resource, current, limit, message }: UpgradePromptProps) {
    const navigate = useNavigate()
    const label = RESOURCE_LABELS[resource] ?? resource

    return (
        <div className="flex items-center gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
            <AlertCircle className="h-5 w-5 shrink-0 text-amber-400" />
            <div className="min-w-0 flex-1">
                <p className="text-sm text-amber-200">
                    {message ?? `You've used ${current}/${limit} ${label}. Upgrade for more.`}
                </p>
            </div>
            <button
                type="button"
                onClick={() => void navigate('/settings', { state: { tab: 'billing' } })}
                className="flex items-center gap-1 whitespace-nowrap rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-black transition-colors hover:bg-amber-400"
            >
                Upgrade
                <ArrowUpRight className="h-3 w-3" />
            </button>
        </div>
    )
}
