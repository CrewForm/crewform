// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useState } from 'react'
import {
    Crown,
    Clock,
    ChevronDown,
    ChevronUp,
    X,
    Zap,
    Users,
    Brain,
    MessageSquare,
    Shield,
    Database,
} from 'lucide-react'
import { useWorkspace } from '@/hooks/useWorkspace'
import { useNavigate } from 'react-router-dom'

/**
 * Trial banner — shown when a workspace has an active (or recently expired) trial.
 *
 * Visual states:
 * - Active (> 2 days left): brand-primary accent
 * - Expiring (≤ 2 days): amber warning
 * - Expired: subtle red, "trial ended" messaging
 */
export function TrialBanner() {
    const { workspace, trialActive, trialDaysLeft, effectivePlan } = useWorkspace()
    const navigate = useNavigate()
    const [dismissed, setDismissed] = useState(false)
    const [showDetails, setShowDetails] = useState(false)

    // Don't show if no trial was ever set, or if workspace is on a paid plan
    const trialExpiresAt = workspace?.trial_expires_at
    if (!trialExpiresAt) return null

    // Check if trial has expired (within last 30 days — after that, stop showing)
    const expiryDate = new Date(trialExpiresAt)
    const daysSinceExpiry = !trialActive
        ? Math.floor((Date.now() - expiryDate.getTime()) / (1000 * 60 * 60 * 24))
        : 0
    const trialExpired = !trialActive && daysSinceExpiry <= 30

    // Don't show if on a paid plan (they upgraded)
    if (effectivePlan !== 'free' && !trialActive) return null

    // Don't show if dismissed (active trials) or expired > 30 days ago
    if (dismissed && trialActive) return null
    if (!trialActive && !trialExpired) return null

    // ─── Visual state ───────────────────────────────────────────────────
    const isExpiring = trialActive && trialDaysLeft <= 2
    const isExpired = trialExpired

    const accentColor = isExpired
        ? 'red'
        : isExpiring
          ? 'amber'
          : 'brand'

    const borderClass = isExpired
        ? 'border-red-500/20 bg-red-500/5'
        : isExpiring
          ? 'border-amber-500/20 bg-amber-500/5'
          : 'border-brand-primary/20 bg-brand-primary/5'

    const iconBgClass = isExpired
        ? 'bg-red-500/10'
        : isExpiring
          ? 'bg-amber-500/10'
          : 'bg-brand-primary/10'

    const iconColorClass = isExpired
        ? 'text-red-400'
        : isExpiring
          ? 'text-amber-400'
          : 'text-brand-primary'

    const progressPercent = trialActive
        ? Math.max(0, Math.min(100, ((7 - trialDaysLeft) / 7) * 100))
        : 100

    const progressBarColor = isExpired
        ? 'bg-red-500/50'
        : isExpiring
          ? 'bg-amber-500/50'
          : 'bg-brand-primary/50'

    // ─── Team-tier features ─────────────────────────────────────────────
    const trialFeatures = [
        { icon: Brain, label: 'Orchestrator Mode', desc: 'Brain agent delegates to workers' },
        { icon: MessageSquare, label: 'Collaboration Mode', desc: 'Multi-agent discussion' },
        { icon: Users, label: 'A2A Protocol', desc: 'Agent-to-agent interoperability' },
        { icon: Database, label: 'Team Memory', desc: 'Shared pgvector semantic search' },
        { icon: Shield, label: 'RBAC & Workspaces', desc: 'Role-based access control' },
        { icon: Zap, label: 'Unlimited Agents & Tasks', desc: 'No free-tier limits' },
    ]

    void accentColor // Used for semantic clarity in the code above

    return (
        <div className={`mb-6 overflow-hidden rounded-xl border ${borderClass} transition-all`}>
            <div className="relative px-5 py-3">
                {/* Dismiss button (active trial only) */}
                {trialActive && (
                    <button
                        type="button"
                        onClick={() => setDismissed(true)}
                        className="absolute right-3 top-3 rounded-lg p-1 text-gray-600 transition-colors hover:text-gray-400"
                        title="Dismiss"
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                )}

                <div className="flex items-center gap-3">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconBgClass}`}>
                        {isExpired ? (
                            <Clock className={`h-4 w-4 ${iconColorClass}`} />
                        ) : (
                            <Crown className={`h-4 w-4 ${iconColorClass}`} />
                        )}
                    </div>

                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-gray-200">
                                {isExpired
                                    ? 'Your Team trial has ended'
                                    : isExpiring
                                      ? `Team trial ending ${trialDaysLeft === 0 ? 'today' : trialDaysLeft === 1 ? 'tomorrow' : `in ${trialDaysLeft} days`}`
                                      : `Team trial — ${trialDaysLeft} ${trialDaysLeft === 1 ? 'day' : 'days'} remaining`}
                            </p>

                            {/* Details toggle */}
                            <button
                                type="button"
                                onClick={() => setShowDetails(!showDetails)}
                                className="inline-flex items-center gap-0.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
                            >
                                {showDetails ? (
                                    <ChevronUp className="h-3 w-3" />
                                ) : (
                                    <ChevronDown className="h-3 w-3" />
                                )}
                                {showDetails ? 'Less' : "What's included"}
                            </button>
                        </div>

                        {/* Progress bar */}
                        <div className="mt-1.5 h-1 w-full max-w-xs rounded-full bg-gray-800">
                            <div
                                className={`h-1 rounded-full transition-all duration-500 ${progressBarColor}`}
                                style={{ width: `${progressPercent}%` }}
                            />
                        </div>

                        <p className="mt-1 text-xs text-gray-500">
                            {isExpired
                                ? "You're back on the Free plan. Upgrade to keep Team-tier features."
                                : 'Full Team-tier access — all features unlocked, no credit card required.'}
                        </p>
                    </div>

                    {/* Upgrade CTA */}
                    <button
                        type="button"
                        onClick={() => void navigate('/settings/billing')}
                        className={`shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                            isExpired
                                ? 'bg-red-500/20 text-red-300 hover:bg-red-500/30'
                                : isExpiring
                                  ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'
                                  : 'bg-brand-primary/10 text-brand-primary hover:bg-brand-primary/20'
                        }`}
                    >
                        <Crown className="h-3 w-3" />
                        Upgrade
                    </button>
                </div>

                {/* Expandable feature list */}
                {showDetails && (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 border-t border-gray-800/50 pt-3">
                        {trialFeatures.map((feature) => (
                            <div
                                key={feature.label}
                                className="flex items-center gap-2 rounded-lg bg-gray-900/40 px-3 py-2"
                            >
                                <feature.icon className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                                <div className="min-w-0">
                                    <p className="text-xs font-medium text-gray-300 truncate">{feature.label}</p>
                                    <p className="text-[10px] text-gray-600 truncate">{feature.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
