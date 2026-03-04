// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Sparkles, ShieldCheck, Copy, Check, Trash2, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useWorkspace } from '@/hooks/useWorkspace'
import { useEELicense } from '@/hooks/useEELicense'
import { FEATURE_MIN_PLAN } from '@/lib/featureFlags'

// ─── Plan presets ────────────────────────────────────────────────────────────

const PLANS = ['pro', 'team', 'enterprise'] as const

function featuresForPlan(plan: string): string[] {
    return Object.entries(FEATURE_MIN_PLAN)
        .filter(([, minPlan]) => {
            const order = { Pro: 0, Team: 1, Enterprise: 2 } as Record<string, number>
            const planLabel = plan.charAt(0).toUpperCase() + plan.slice(1)
            return (order[minPlan] ?? 0) <= (order[planLabel] ?? 0)
        })
        .map(([feature]) => feature)
}

// ─── Component ───────────────────────────────────────────────────────────────

export function LicenseAdminPanel() {
    const { workspaceId } = useWorkspace()
    const { license, isLoading } = useEELicense(workspaceId ?? undefined)
    const queryClient = useQueryClient()

    const [plan, setPlan] = useState<string>('team')
    const [seats, setSeats] = useState(10)
    const [validUntil, setValidUntil] = useState('')
    const [generatedKey, setGeneratedKey] = useState('')
    const [copied, setCopied] = useState(false)

    // Generate license mutation
    const generateMutation = useMutation({
        mutationFn: async () => {
            const features = featuresForPlan(plan)
            const result = await supabase.functions.invoke('generate-license', {
                body: {
                    workspaceId,
                    plan,
                    features,
                    seats,
                    validUntil: validUntil || null,
                },
            })
            if (result.error) throw result.error
            return result.data as { license_key: string }
        },
        onSuccess: (data) => {
            setGeneratedKey(data.license_key)
            void queryClient.invalidateQueries({ queryKey: ['ee-license'] })
        },
    })

    // Revoke license mutation
    const revokeMutation = useMutation({
        mutationFn: async (licenseId: string) => {
            const result = await supabase.functions.invoke('revoke-license', {
                body: { licenseId },
            })
            if (result.error) throw result.error
        },
        onSuccess: () => {
            setGeneratedKey('')
            void queryClient.invalidateQueries({ queryKey: ['ee-license'] })
        },
    })

    function handleCopy() {
        void navigator.clipboard.writeText(generatedKey)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-lg font-semibold text-gray-200">License Management</h2>
                <p className="mt-1 text-sm text-gray-500">
                    Generate and manage Enterprise license keys for workspaces.
                </p>
            </div>

            {/* Current license */}
            {license && (
                <div className="rounded-xl border border-border bg-surface-card p-5">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-500/20">
                                <ShieldCheck className="h-4.5 w-4.5 text-green-400" />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-gray-200">
                                    Active License — <span className="capitalize">{license.plan}</span>
                                </p>
                                <p className="text-xs text-gray-500">
                                    {license.seats} seats · {license.features.length} features
                                    {license.valid_until
                                        ? ` · expires ${new Date(license.valid_until).toLocaleDateString()}`
                                        : ' · perpetual'}
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => revokeMutation.mutate(license.id)}
                            disabled={revokeMutation.isPending}
                            className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-500/10 disabled:opacity-50"
                        >
                            {revokeMutation.isPending ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                                <span className="flex items-center gap-1.5">
                                    <Trash2 className="h-3 w-3" />
                                    Revoke
                                </span>
                            )}
                        </button>
                    </div>
                </div>
            )}

            {/* Generate form */}
            <div className="rounded-xl border border-border bg-surface-card p-5">
                <h3 className="mb-4 text-sm font-semibold text-gray-300">Generate New License</h3>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    {/* Plan */}
                    <div>
                        <label className="mb-1.5 block text-xs font-medium text-gray-400">Plan</label>
                        <select
                            value={plan}
                            onChange={(e) => setPlan(e.target.value)}
                            className="w-full rounded-lg border border-border bg-surface-primary px-3 py-2 text-sm text-gray-200 outline-none focus:border-brand-primary"
                        >
                            {PLANS.map((p) => (
                                <option key={p} value={p}>
                                    {p.charAt(0).toUpperCase() + p.slice(1)} ({featuresForPlan(p).length} features)
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Seats */}
                    <div>
                        <label className="mb-1.5 block text-xs font-medium text-gray-400">Seats</label>
                        <input
                            type="number"
                            min={1}
                            max={10000}
                            value={seats}
                            onChange={(e) => setSeats(Number(e.target.value))}
                            className="w-full rounded-lg border border-border bg-surface-primary px-3 py-2 text-sm text-gray-200 outline-none focus:border-brand-primary"
                        />
                    </div>

                    {/* Expiry */}
                    <div>
                        <label className="mb-1.5 block text-xs font-medium text-gray-400">
                            Expiry <span className="text-gray-600">(optional)</span>
                        </label>
                        <input
                            type="date"
                            value={validUntil}
                            onChange={(e) => setValidUntil(e.target.value)}
                            className="w-full rounded-lg border border-border bg-surface-primary px-3 py-2 text-sm text-gray-200 outline-none focus:border-brand-primary"
                        />
                    </div>
                </div>

                {/* Features preview */}
                <div className="mt-4">
                    <p className="mb-2 text-xs font-medium text-gray-400">
                        Included features ({featuresForPlan(plan).length}):
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                        {featuresForPlan(plan).map((f) => (
                            <span
                                key={f}
                                className="rounded-full bg-violet-500/10 border border-violet-500/20 px-2 py-0.5 text-[10px] text-violet-300"
                            >
                                {f.replace(/_/g, ' ')}
                            </span>
                        ))}
                    </div>
                </div>

                <button
                    type="button"
                    onClick={() => generateMutation.mutate()}
                    disabled={generateMutation.isPending}
                    className="mt-5 flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-500 disabled:opacity-50"
                >
                    {generateMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <Sparkles className="h-4 w-4" />
                    )}
                    Generate License Key
                </button>

                {generateMutation.isError && (
                    <p className="mt-2 text-xs text-red-400">
                        {generateMutation.error instanceof Error
                            ? generateMutation.error.message
                            : 'Failed to generate license'}
                    </p>
                )}
            </div>

            {/* Generated key display */}
            {generatedKey && (
                <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-5">
                    <p className="mb-2 text-xs font-medium text-green-400">License key generated successfully:</p>
                    <div className="flex items-center gap-2">
                        <code className="flex-1 overflow-x-auto rounded-lg bg-black/30 px-3 py-2 text-xs text-gray-300 font-mono">
                            {generatedKey}
                        </code>
                        <button
                            type="button"
                            onClick={handleCopy}
                            className="rounded-lg border border-border px-3 py-2 text-xs text-gray-400 transition hover:text-gray-200"
                        >
                            {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                        </button>
                    </div>
                    <p className="mt-2 text-[10px] text-gray-500">
                        Copy this key and share it with the customer. It cannot be retrieved later.
                    </p>
                </div>
            )}
        </div>
    )
}
