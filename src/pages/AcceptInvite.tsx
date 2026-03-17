// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Loader2, CheckCircle2, XCircle, UserPlus } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { acceptInvitation } from '@/db/members'

type InviteState = 'loading' | 'accepting' | 'success' | 'error' | 'unauthenticated'

export function AcceptInvite() {
    const { token } = useParams<{ token: string }>()
    const navigate = useNavigate()
    const { user, loading: authLoading } = useAuth()
    const [state, setState] = useState<InviteState>('loading')
    const [errorMsg, setErrorMsg] = useState('')

    useEffect(() => {
        if (authLoading) return

        if (!user) {
            setState('unauthenticated')
            return
        }

        if (!token) {
            setState('error')
            setErrorMsg('Invalid invite link — no token provided.')
            return
        }

        // Auto-accept the invitation
        setState('accepting')
        void (async () => {
            try {
                const result = await acceptInvitation(token)
                if (result.success) {
                    setState('success')
                    // Redirect to dashboard after a short delay
                    setTimeout(() => {
                        navigate('/', { replace: true })
                    }, 2000)
                } else {
                    setState('error')
                    setErrorMsg(result.error ?? 'Failed to accept invitation.')
                }
            } catch (err: unknown) {
                setState('error')
                setErrorMsg(err instanceof Error ? err.message : 'An unexpected error occurred.')
            }
        })()
    }, [user, authLoading, token, navigate])

    return (
        <div className="flex min-h-screen items-center justify-center bg-surface-primary px-4">
            <div className="w-full max-w-sm rounded-xl border border-border bg-surface-card p-8 text-center shadow-lg">

                {state === 'loading' && (
                    <>
                        <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-brand-primary" />
                        <h2 className="text-lg font-semibold text-gray-200">Loading…</h2>
                    </>
                )}

                {state === 'unauthenticated' && (
                    <>
                        <UserPlus className="mx-auto mb-4 h-10 w-10 text-brand-primary" />
                        <h2 className="mb-2 text-lg font-semibold text-gray-200">
                            You&apos;ve been invited!
                        </h2>
                        <p className="mb-6 text-sm text-gray-400">
                            Sign in or create an account to accept this workspace invitation.
                        </p>
                        <button
                            type="button"
                            onClick={() => navigate(`/auth?redirect=/invite/${token ?? ''}`, { replace: true })}
                            className="w-full rounded-lg bg-brand-primary py-2.5 text-sm font-semibold text-black transition-colors hover:bg-brand-hover"
                        >
                            Sign In / Sign Up
                        </button>
                    </>
                )}

                {state === 'accepting' && (
                    <>
                        <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-brand-primary" />
                        <h2 className="text-lg font-semibold text-gray-200">Accepting invitation…</h2>
                        <p className="mt-1 text-sm text-gray-400">Please wait while we add you to the workspace.</p>
                    </>
                )}

                {state === 'success' && (
                    <>
                        <CheckCircle2 className="mx-auto mb-4 h-10 w-10 text-green-400" />
                        <h2 className="text-lg font-semibold text-gray-200">Welcome!</h2>
                        <p className="mt-1 text-sm text-gray-400">
                            You&apos;ve joined the workspace. Redirecting…
                        </p>
                    </>
                )}

                {state === 'error' && (
                    <>
                        <XCircle className="mx-auto mb-4 h-10 w-10 text-red-400" />
                        <h2 className="mb-2 text-lg font-semibold text-gray-200">
                            Unable to accept invitation
                        </h2>
                        <p className="mb-4 text-sm text-red-400">{errorMsg}</p>
                        <button
                            type="button"
                            onClick={() => navigate('/', { replace: true })}
                            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-surface-elevated"
                        >
                            Go to Dashboard
                        </button>
                    </>
                )}
            </div>
        </div>
    )
}
