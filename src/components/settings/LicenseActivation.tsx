// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ShieldCheck, Loader2, KeyRound, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useWorkspace } from '@/hooks/useWorkspace'
import { useEELicense } from '@/hooks/useEELicense'

/**
 * LicenseActivation — for self-hosted customers to paste a pre-signed
 * license key and activate EE features on their workspace.
 *
 * Shown in Settings → Workspace for CE deployments (no admin_panel required).
 */
export function LicenseActivation() {
    const { workspaceId } = useWorkspace()
    const { license, isLoading } = useEELicense(workspaceId ?? undefined)
    const queryClient = useQueryClient()

    const [key, setKey] = useState('')

    const activateMutation = useMutation({
        mutationFn: async (licenseKey: string) => {
            const result = await supabase.functions.invoke('activate-license', {
                body: { licenseKey },
            })
            if (result.error) throw result.error
            return result.data as { activated: boolean; license: { plan: string; features: string[] } }
        },
        onSuccess: () => {
            setKey('')
            void queryClient.invalidateQueries({ queryKey: ['ee-license'] })
        },
    })

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
            </div>
        )
    }

    // Already activated — show current license
    if (license) {
        return (
            <div className="rounded-xl border border-border bg-surface-card p-5">
                <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-500/20">
                        <ShieldCheck className="h-4.5 w-4.5 text-green-400" />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-gray-200">
                            License Active — <span className="capitalize">{license.plan}</span> Plan
                        </p>
                        <p className="text-xs text-gray-500">
                            {license.features.length} features · {license.seats} seats
                            {license.valid_until
                                ? ` · expires ${new Date(license.valid_until).toLocaleDateString()}`
                                : ' · perpetual'}
                        </p>
                    </div>
                </div>
            </div>
        )
    }

    // No license — show activation form
    return (
        <div className="rounded-xl border border-border bg-surface-card p-5">
            <div className="flex items-center gap-2 mb-3">
                <KeyRound className="h-4 w-4 text-violet-400" />
                <h3 className="text-sm font-semibold text-gray-200">Activate License</h3>
            </div>
            <p className="mb-4 text-xs text-gray-500">
                Paste your license key below to unlock Pro, Team, or Enterprise features.
            </p>

            <div className="flex gap-2">
                <input
                    type="text"
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    placeholder="CF-team-eyJ..."
                    className="flex-1 rounded-lg border border-border bg-surface-primary px-3 py-2 text-sm text-gray-200 font-mono placeholder-gray-600 outline-none focus:border-brand-primary"
                />
                <button
                    type="button"
                    onClick={() => activateMutation.mutate(key.trim())}
                    disabled={!key.trim() || activateMutation.isPending}
                    className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-500 disabled:opacity-50"
                >
                    {activateMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        'Activate'
                    )}
                </button>
            </div>

            {activateMutation.isError && (
                <div className="mt-3 flex items-center gap-2 text-xs text-red-400">
                    <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                    <span>
                        {activateMutation.error instanceof Error
                            ? activateMutation.error.message
                            : 'Failed to activate license'}
                    </span>
                </div>
            )}

            {activateMutation.isSuccess && (
                <p className="mt-3 text-xs text-green-400">
                    ✓ License activated successfully! Features are now unlocked.
                </p>
            )}
        </div>
    )
}
