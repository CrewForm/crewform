// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { Check, X, Loader2 } from 'lucide-react'
import { useWorkspace } from '@/hooks/useWorkspace'
import { useCreateCheckout } from '@/hooks/useBilling'
import { cn } from '@/lib/utils'

interface PlanFeature {
    label: string
    free: string | boolean
    pro: string | boolean
    team: string | boolean
    enterprise: string | boolean
}

const FEATURES: PlanFeature[] = [
    { label: 'Agents', free: '3', pro: '25', team: 'Unlimited', enterprise: 'Unlimited' },
    { label: 'Tasks / month', free: '50', pro: '1,000', team: 'Unlimited', enterprise: 'Unlimited' },
    { label: 'Teams', free: '1', pro: '10', team: 'Unlimited', enterprise: 'Unlimited' },
    { label: 'Members', free: '1', pro: '3', team: '25', enterprise: 'Unlimited' },
    { label: 'Triggers', free: '1', pro: '10', team: 'Unlimited', enterprise: 'Unlimited' },
    { label: 'Models (BYOK)', free: true, pro: true, team: true, enterprise: true },
    { label: 'Orchestrator Mode', free: false, pro: true, team: true, enterprise: true },
    { label: 'Custom Tools', free: false, pro: true, team: true, enterprise: true },
    { label: 'Messaging Channels', free: false, pro: true, team: true, enterprise: true },
    { label: 'Advanced Analytics', free: false, pro: true, team: true, enterprise: true },
    { label: 'Collaboration Mode', free: false, pro: false, team: true, enterprise: true },
    { label: 'Team Memory', free: false, pro: false, team: true, enterprise: true },
    { label: 'RBAC', free: false, pro: false, team: true, enterprise: true },
    { label: 'Audit Log', free: false, pro: false, team: false, enterprise: 'Full history' },
    { label: 'Swarm', free: false, pro: false, team: false, enterprise: true },
    { label: 'Priority Support', free: false, pro: false, team: true, enterprise: true },
]

const PLANS = [
    { key: 'free' as const, name: 'Free', price: '$0', period: 'forever', highlight: false },
    { key: 'pro' as const, name: 'Pro', price: '$39', period: '/month', highlight: true },
    { key: 'team' as const, name: 'Team', price: '$99', period: '/month', highlight: false },
    { key: 'enterprise' as const, name: 'Enterprise', price: 'Custom', period: '', highlight: false },
]

const PLAN_ORDER: Record<string, number> = { free: 0, pro: 1, team: 2, enterprise: 3 }

export function PricingTable() {
    const { workspace, workspaceId } = useWorkspace()
    const checkoutMutation = useCreateCheckout()
    const currentPlan = workspace?.plan ?? 'free'
    const currentTier = PLAN_ORDER[currentPlan] ?? 0

    function handleUpgrade(plan: 'pro' | 'team' | 'enterprise') {
        if (!workspaceId) return
        if (plan === 'enterprise') {
            window.open('mailto:team@crewform.tech?subject=Enterprise%20Plan%20Inquiry', '_blank')
            return
        }
        checkoutMutation.mutate({ workspaceId, plan })
    }

    return (
        <div className="grid gap-4 lg:grid-cols-4">
            {PLANS.map((plan) => {
                const planTier = PLAN_ORDER[plan.key] ?? 0
                const isCurrent = plan.key === currentPlan
                const isUpgrade = planTier > currentTier
                const isDowngrade = planTier < currentTier

                return (
                    <div
                        key={plan.key}
                        className={cn(
                            'relative rounded-xl border p-5 transition-shadow',
                            isCurrent
                                ? 'border-brand-primary bg-brand-primary/5 ring-1 ring-brand-primary/30'
                                : plan.highlight && isUpgrade
                                    ? 'border-brand-primary bg-brand-primary/5 shadow-lg shadow-brand-primary/10'
                                    : 'border-border bg-surface-card',
                        )}
                    >
                        {isCurrent && (
                            <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-primary px-3 py-0.5 text-[10px] font-bold uppercase text-black">
                                Current Plan
                            </div>
                        )}
                        {!isCurrent && plan.highlight && isUpgrade && (
                            <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-primary px-3 py-0.5 text-[10px] font-bold uppercase text-black">
                                Most Popular
                            </div>
                        )}

                        <h3 className="mb-1 text-lg font-semibold text-gray-200">{plan.name}</h3>
                        <p className="mb-4">
                            <span className="text-3xl font-bold text-gray-100">{plan.price}</span>
                            <span className="text-sm text-gray-500">{plan.period}</span>
                        </p>

                        {isCurrent ? (
                            <div className="mb-5 rounded-lg border border-brand-primary/30 bg-brand-primary/10 px-3 py-2 text-center text-xs font-medium text-brand-primary">
                                Your current plan
                            </div>
                        ) : isDowngrade ? (
                            <div className="mb-5 rounded-lg border border-border bg-surface-raised px-3 py-2 text-center text-xs text-gray-600">
                                Included in your plan
                            </div>
                        ) : isUpgrade && plan.key !== 'enterprise' ? (
                            <button
                                type="button"
                                onClick={() => handleUpgrade(plan.key as 'pro' | 'team')}
                                disabled={checkoutMutation.isPending}
                                className={cn(
                                    'mb-5 w-full rounded-lg px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-50',
                                    plan.highlight
                                        ? 'bg-brand-primary text-black hover:bg-brand-hover'
                                        : 'border border-border bg-surface-raised text-gray-200 hover:bg-surface-elevated',
                                )}
                            >
                                {checkoutMutation.isPending ? (
                                    <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                                ) : (
                                    `Upgrade to ${plan.name}`
                                )}
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={() => handleUpgrade('enterprise')}
                                className="mb-5 w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-xs font-semibold text-gray-200 transition-colors hover:bg-surface-elevated"
                            >
                                Contact Sales
                            </button>
                        )}

                        {/* Features */}
                        <ul className="space-y-2">
                            {FEATURES.map((feature) => {
                                const value = feature[plan.key]
                                return (
                                    <li key={feature.label} className="flex items-center gap-2 text-xs">
                                        {value === false ? (
                                            <X className="h-3.5 w-3.5 shrink-0 text-gray-600" />
                                        ) : (
                                            <Check className="h-3.5 w-3.5 shrink-0 text-green-400" />
                                        )}
                                        <span className={value === false ? 'text-gray-600' : 'text-gray-300'}>
                                            {feature.label}
                                            {typeof value === 'string' && (
                                                <span className="ml-1 text-gray-500">({value})</span>
                                            )}
                                        </span>
                                    </li>
                                )
                            })}
                        </ul>
                    </div>
                )
            })}
        </div>
    )
}
