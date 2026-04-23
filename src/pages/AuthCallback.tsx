// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'

/**
 * AuthCallback handles the redirect from OAuth providers and email
 * confirmation links. Supabase appends tokens as URL hash fragments —
 * this page exchanges them for a session via onAuthStateChange.
 *
 * PKCE flow: when the email verification link opens in a different browser
 * context (email app webview, different browser), the code verifier stored
 * in sessionStorage is missing. In that case, onAuthStateChange never fires
 * SIGNED_IN. We handle this gracefully by:
 * 1. Checking if the user is already authenticated (e.g. already signed in)
 * 2. If not, showing a success message explaining the email was verified
 *    and they can sign in from their original browser/tab.
 */
export function AuthCallback() {
    const navigate = useNavigate()
    const [status, setStatus] = useState<'loading' | 'verified' | 'error'>('loading')
    const [errorMessage, setErrorMessage] = useState<string | null>(null)

    useEffect(() => {
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN' && session) {
                // Successful token exchange — redirect to app
                const pendingRedirect = sessionStorage.getItem('crewform:authRedirect')
                sessionStorage.removeItem('crewform:authRedirect')
                navigate(pendingRedirect ?? '/', { replace: true })
            } else if (event === 'PASSWORD_RECOVERY') {
                navigate('/auth/reset-password', { replace: true })
            }
        })

        // Fallback: if no auth event fires within 5s, check if user is already signed in
        const timeout = setTimeout(() => {
            void (async () => {
                try {
                    const { data: { session } } = await supabase.auth.getSession()

                    if (session) {
                        // User is already authenticated — just redirect
                        const pendingRedirect = sessionStorage.getItem('crewform:authRedirect')
                        sessionStorage.removeItem('crewform:authRedirect')
                        navigate(pendingRedirect ?? '/', { replace: true })
                    } else {
                        // No session — likely opened verification link in different browser.
                        // The email IS verified, they just need to sign in.
                        setStatus('verified')
                    }
                } catch {
                    setErrorMessage('Something went wrong. Please try signing in.')
                    setStatus('error')
                }
            })()
        }, 5000)

        return () => {
            subscription.unsubscribe()
            clearTimeout(timeout)
        }
    }, [navigate])

    // ─── Verified state — email confirmed, prompt to sign in ────────────
    if (status === 'verified') {
        return (
            <div className="flex min-h-screen items-center justify-center bg-gray-950">
                <div className="w-full max-w-md rounded-xl border border-gray-800 bg-gray-900 p-8 text-center">
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
                        <CheckCircle2 className="h-6 w-6 text-emerald-400" />
                    </div>
                    <h2 className="mb-2 text-lg font-semibold text-gray-100">Email verified!</h2>
                    <p className="mb-6 text-sm text-gray-400">
                        Your email has been confirmed. Sign in to get started with CrewForm.
                    </p>
                    <button
                        type="button"
                        onClick={() => navigate('/auth', { replace: true })}
                        className="inline-flex items-center gap-2 rounded-lg bg-brand-primary px-6 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-brand-hover"
                    >
                        Sign In
                    </button>
                </div>
            </div>
        )
    }

    // ─── Error state ────────────────────────────────────────────────────
    if (status === 'error') {
        return (
            <div className="flex min-h-screen items-center justify-center bg-gray-950">
                <div className="w-full max-w-md rounded-xl border border-gray-800 bg-gray-900 p-8 text-center">
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
                        <AlertCircle className="h-6 w-6 text-red-400" />
                    </div>
                    <h2 className="mb-2 text-lg font-semibold text-gray-100">Something went wrong</h2>
                    <p className="mb-6 text-sm text-gray-400">
                        {errorMessage ?? 'Authentication failed. Please try signing in again.'}
                    </p>
                    <button
                        type="button"
                        onClick={() => navigate('/auth', { replace: true })}
                        className="inline-flex items-center gap-2 rounded-lg bg-brand-primary px-6 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-brand-hover"
                    >
                        Back to Sign In
                    </button>
                </div>
            </div>
        )
    }

    // ─── Loading state ──────────────────────────────────────────────────
    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-950">
            <div className="flex flex-col items-center gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
                <span className="text-sm text-gray-400">Completing sign in...</span>
            </div>
        </div>
    )
}

