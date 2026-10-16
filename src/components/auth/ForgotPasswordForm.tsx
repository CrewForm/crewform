// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { useState, type FormEvent } from 'react'
import type { AuthError } from '@supabase/supabase-js'

interface ForgotPasswordFormProps {
    onResetPassword: (email: string) => Promise<{ error: AuthError | null }>
    onBackToLogin: () => void
}

export function ForgotPasswordForm({ onResetPassword, onBackToLogin }: ForgotPasswordFormProps) {
    const [email, setEmail] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)
    const [loading, setLoading] = useState(false)

    async function handleSubmit(e: FormEvent) {
        e.preventDefault()
        setError(null)
        setLoading(true)

        const { error: authError } = await onResetPassword(email)
        if (authError) {
            setError(authError.message)
        } else {
            setSuccess(true)
        }
        setLoading(false)
    }

    if (success) {
        return (
            <div className="space-y-4 text-center">
                <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-6">
                    <div className="mb-3 flex justify-center">
                        <svg className="h-8 w-8 text-green-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                        </svg>
                    </div>
                    <h3 className="text-lg font-medium text-green-400">Check your email</h3>
                    <p className="mt-2 text-sm text-gray-400">
                        We&apos;ve sent a password reset link to{' '}
                        <strong className="text-gray-300">{email}</strong>.
                        Click the link to set a new password.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onBackToLogin}
                    className="text-sm text-blue-400 hover:text-blue-300"
                >
                    Back to sign in
                </button>
            </div>
        )
    }

    return (
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <p className="text-sm text-gray-400">
                Enter your email address and we&apos;ll send you a link to reset your password.
            </p>

            {error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                    {error}
                </div>
            )}

            <div>
                <label htmlFor="forgot-email" className="mb-1.5 block text-sm font-medium text-gray-300">
                    Email
                </label>
                <input
                    id="forgot-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-gray-200 placeholder-gray-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    autoFocus
                />
            </div>

            <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
                {loading ? 'Sending...' : 'Send Reset Link'}
            </button>

            <p className="mt-6 text-center text-xs text-gray-500">
                Remember your password?{' '}
                <button
                    type="button"
                    onClick={onBackToLogin}
                    className="text-blue-400 hover:text-blue-300"
                >
                    Sign in
                </button>
            </p>
        </form>
    )
}
