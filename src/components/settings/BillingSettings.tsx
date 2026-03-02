// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { Loader2, CreditCard, ExternalLink, Sparkles } from 'lucide-react'
import { useWorkspace } from '@/hooks/useWorkspace'
import { useSubscription, useUsage, useCreatePortal } from '@/hooks/useBilling'
import { PricingTable } from '@/components/billing/PricingTable'
import { cn } from '@/lib/utils'

const PLAN_COLORS: Record<string, string> = {
    free: 'text-gray-400 bg-gray-500/10',
    pro: 'text-brand-primary bg-brand-primary/10',
    team: 'text-purple-400 bg-purple-500/10',
    enterprise: 'text-amber-400 bg-amber-500/10',
}

interface MeterProps {
    label: string
    current: number
    limit: number // -1 = unlimited
}

function UsageMeter({ label, current, limit }: MeterProps) {
    const isUnlimited = limit === -1
    const pct = isUnlimited ? 0 : Math.min((current / limit) * 100, 100)
    const isNearLimit = !isUnlimited && pct >= 80
    const isAtLimit = !isUnlimited && current >= limit

    return (
        <div>
            <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-gray-400">{label}</span>
                <span className={cn(
                    'font-medium',
                    isAtLimit ? 'text-red-400' : isNearLimit ? 'text-amber-400' : 'text-gray-300',
                )}>
                    {current} / {isUnlimited ? '∞' : limit}
                </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-surface-raised">
                <div
                    className={cn(
                        'h-1.5 rounded-full transition-all',
                        isAtLimit ? 'bg-red-500' : isNearLimit ? 'bg-amber-500' : 'bg-brand-primary',
                    )}
                    style={{ width: isUnlimited ? '0%' : `${pct}%` }}
                />
            </div>
        </div>
    )
}

/**
 * Billing settings tab — current plan, usage meters, upgrade options.
 * Reads plan from workspace.plan (single source of truth).
 */
export function BillingSettings() {
    const { workspace, workspaceId } = useWorkspace()
    const { data: subscription, isLoading: isLoadingSub } = useSubscription(workspaceId)
    const { data: usage, isLoading: isLoadingUsage } = useUsage(workspaceId)
    const portalMutation = useCreatePortal()

    // Single source of truth: workspace.plan
    const plan = workspace?.plan ?? 'free'
    const isBeta = workspace?.is_beta ?? false
    const isPaid = plan !== 'free'
    const hasStripe = !!subscription?.stripe_subscription_id

    if (isLoadingSub || isLoadingUsage) {
        return (
            <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
            </div>
        )
    }

    // Plan limits — beta overrides everything to unlimited
    const LIMITS: Record<string, Record<string, number>> = {
        free: { agents: 3, tasks: 50, teams: 1, members: 1, triggers: 1 },
        pro: { agents: 25, tasks: 1000, teams: 10, members: 3, triggers: 10 },
        team: { agents: -1, tasks: -1, teams: -1, members: 25, triggers: -1 },
        enterprise: { agents: -1, tasks: -1, teams: -1, members: -1, triggers: -1 },
    }

    const baseLimits = LIMITS[plan] ?? LIMITS.free
    // Beta workspaces get unlimited everything
    const limits = isBeta
        ? { agents: -1, tasks: -1, teams: -1, members: -1, triggers: -1 }
        : baseLimits

    return (
        <div className="space-y-6">
            {/* Current plan card */}
            <div className="rounded-xl border border-border bg-surface-card p-5">
                <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <CreditCard className="h-5 w-5 text-brand-primary" />
                        <h3 className="text-sm font-medium text-gray-200">Current Plan</h3>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className={cn(
                            'rounded-md px-2.5 py-1 text-xs font-bold uppercase',
                            PLAN_COLORS[plan],
                        )}>
                            {plan}
                        </span>
                        {isBeta && (
                            <span className="flex items-center gap-1 rounded-md bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-400">
                                <Sparkles className="h-3 w-3" />
                                Beta
                            </span>
                        )}
                    </div>
                </div>

                {isBeta && (
                    <p className="mb-3 text-xs text-emerald-400/70">
                        Beta access — all features unlocked with unlimited usage.
                    </p>
                )}

                {subscription?.current_period_end && (
                    <p className="mb-3 text-xs text-gray-500">
                        {subscription.cancel_at_period_end
                            ? `Cancels on ${new Date(subscription.current_period_end).toLocaleDateString()}`
                            : `Renews on ${new Date(subscription.current_period_end).toLocaleDateString()}`
                        }
                    </p>
                )}

                {hasStripe && (
                    <button
                        type="button"
                        onClick={() => workspaceId && portalMutation.mutate({ workspaceId })}
                        disabled={portalMutation.isPending}
                        className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-gray-400 transition-colors hover:bg-surface-elevated hover:text-gray-200"
                    >
                        {portalMutation.isPending ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                            <ExternalLink className="h-3 w-3" />
                        )}
                        Manage Subscription
                    </button>
                )}
            </div>

            {/* Usage meters */}
            {usage && (
                <div className="rounded-xl border border-border bg-surface-card p-5">
                    <h3 className="mb-4 text-sm font-medium text-gray-200">Resource Usage</h3>
                    <div className="space-y-3">
                        <UsageMeter label="Agents" current={usage.agents} limit={limits.agents} />
                        <UsageMeter label="Tasks (this month)" current={usage.tasksThisMonth} limit={limits.tasks} />
                        <UsageMeter label="Teams" current={usage.teams} limit={limits.teams} />
                        <UsageMeter label="Workspace Members" current={usage.members} limit={limits.members} />
                        <UsageMeter label="Triggers" current={usage.triggers} limit={limits.triggers} />
                    </div>
                </div>
            )}

            {/* Pricing table — only show if not beta and not on highest plan */}
            {!isBeta && plan !== 'enterprise' && (
                <div>
                    <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
                        {isPaid ? 'Change Plan' : 'Upgrade Your Plan'}
                    </h3>
                    <PricingTable />
                </div>
            )}
        </div>
    )
}
