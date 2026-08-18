// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import type { AuthError } from '@supabase/supabase-js'

interface ResetPasswordFormProps {
    onUpdatePassword: (newPassword: string) => Promise<{ error: AuthError | null }>
}

export function ResetPasswordForm({ onUpdatePassword }: ResetPasswordFormProps) {
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)
    const [loading, setLoading] = useState(false)
    const navigate = useNavigate()

    async function handleSubmit(e: FormEvent) {
        e.preventDefault()
        setError(null)

        if (password !== confirmPassword) {
            setError('Passwords do not match')
            return
        }

        if (password.length < 8) {
            setError('Password must be at least 8 characters')
            return
        }

        setLoading(true)
        const { error: authError } = await onUpdatePassword(password)
        if (authError) {
            setError(authError.message)
        } else {
            setSuccess(true)
            // Redirect to dashboard after a short delay
            setTimeout(() => {
                void navigate('/', { replace: true })
            }, 2000)
        }
        setLoading(false)
    }

    if (success) {
        return (
            <div className="space-y-4 text-center">
                <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-6">
                    <div className="mb-3 flex justify-center">
                        <svg className="h-8 w-8 text-green-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                        </svg>
                    </div>
                    <h3 className="text-lg font-medium text-green-400">Password updated!</h3>
                    <p className="mt-2 text-sm text-gray-400">
                        Your password has been reset successfully. Redirecting to your dashboard...
                    </p>
                </div>
            </div>
        )
    }

    return (
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <p className="text-sm text-gray-400">
                Enter your new password below.
            </p>

            {error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                    {error}
                </div>
            )}

            <div>
                <label htmlFor="reset-password" className="mb-1.5 block text-sm font-medium text-gray-300">
                    New Password
                </label>
                <input
                    id="reset-password"
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-gray-200 placeholder-gray-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    autoFocus
                />
            </div>

            <div>
                <label htmlFor="reset-confirm" className="mb-1.5 block text-sm font-medium text-gray-300">
                    Confirm Password
                </label>
                <input
                    id="reset-confirm"
                    type="password"
                    required
                    minLength={8}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-gray-200 placeholder-gray-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
            </div>

            <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
                {loading ? 'Updating...' : 'Update Password'}
            </button>
        </form>
    )
}
