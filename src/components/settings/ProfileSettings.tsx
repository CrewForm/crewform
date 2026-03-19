// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useState, useEffect } from 'react'
import { User, Save, Loader2, Mail, Lock, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'

/**
 * Profile settings — display name and email (read-only).
 */
export function ProfileSettings() {
    const { user } = useAuth()
    const [displayName, setDisplayName] = useState('')
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Password change state
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [passwordSaving, setPasswordSaving] = useState(false)
    const [passwordSaved, setPasswordSaved] = useState(false)
    const [passwordError, setPasswordError] = useState<string | null>(null)

    // Sync from auth user on load
    useEffect(() => {
        if (user) {
            const meta = user.user_metadata
            const name = String(meta.display_name ?? meta.full_name ?? '')
            setDisplayName(name)
        }
    }, [user])

    const getStoredName = () => {
        if (!user) return ''
        const meta = user.user_metadata
        return String(meta.display_name ?? meta.full_name ?? '')
    }
    const isDirty = displayName !== getStoredName()

    async function handleSave() {
        setSaving(true)
        setError(null)
        setSaved(false)

        const { error: err } = await supabase.auth.updateUser({
            data: { display_name: displayName },
        })

        setSaving(false)
        if (err) {
            setError(err.message)
        } else {
            setSaved(true)
            setTimeout(() => setSaved(false), 3000)
        }
    }

    return (
        <div className="space-y-6">
            {/* Profile card */}
            <div className="rounded-lg border border-border bg-surface-card p-5">
                <div className="mb-4 flex items-center gap-2">
                    <User className="h-5 w-5 text-brand-primary" />
                    <h3 className="text-sm font-medium text-gray-200">Profile</h3>
                </div>

                <div className="space-y-4">
                    {/* Email — read only */}
                    <div>
                        <label className="mb-1.5 flex items-center gap-1 text-xs font-medium text-gray-400">
                            <Mail className="h-3 w-3" />
                            Email
                        </label>
                        <input
                            type="email"
                            value={user?.email ?? ''}
                            disabled
                            className="w-full rounded-lg border border-border bg-surface-primary px-3 py-2 text-sm text-gray-400 outline-none disabled:opacity-50"
                        />
                        <p className="mt-1 text-[10px] text-gray-600">
                            Email cannot be changed here. Contact support if needed.
                        </p>
                    </div>

                    {/* Display name */}
                    <div>
                        <label className="mb-1.5 block text-xs font-medium text-gray-400">
                            Display Name
                        </label>
                        <input
                            type="text"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            placeholder="Your name"
                            className="w-full rounded-lg border border-border bg-surface-primary px-3 py-2 text-sm text-gray-200 outline-none focus:border-brand-primary"
                        />
                    </div>

                    {/* Save button */}
                    {isDirty && (
                        <button
                            type="button"
                            onClick={() => void handleSave()}
                            disabled={saving}
                            className="flex items-center gap-1.5 rounded-lg bg-brand-primary px-4 py-2 text-xs font-medium text-black transition-colors hover:bg-brand-hover disabled:opacity-50"
                        >
                            {saving ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                                <Save className="h-3 w-3" />
                            )}
                            Save Profile
                        </button>
                    )}

                    {saved && (
                        <p className="text-xs text-green-400">Profile updated successfully.</p>
                    )}
                    {error && (
                        <p className="text-xs text-red-400">{error}</p>
                    )}
                </div>
            </div>

            {/* Change Password card */}
            <div className="rounded-lg border border-border bg-surface-card p-5">
                <div className="mb-4 flex items-center gap-2">
                    <Lock className="h-5 w-5 text-brand-primary" />
                    <h3 className="text-sm font-medium text-gray-200">Change Password</h3>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="mb-1.5 block text-xs font-medium text-gray-400">
                            New Password
                        </label>
                        <div className="relative">
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="Minimum 8 characters"
                                className="w-full rounded-lg border border-border bg-surface-primary px-3 py-2 pr-9 text-sm text-gray-200 outline-none focus:border-brand-primary"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                            >
                                {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                            </button>
                        </div>
                    </div>

                    <div>
                        <label className="mb-1.5 block text-xs font-medium text-gray-400">
                            Confirm Password
                        </label>
                        <input
                            type={showPassword ? 'text' : 'password'}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Re-enter new password"
                            className="w-full rounded-lg border border-border bg-surface-primary px-3 py-2 text-sm text-gray-200 outline-none focus:border-brand-primary"
                        />
                    </div>

                    <button
                        type="button"
                        onClick={() => {
                            setPasswordError(null)
                            setPasswordSaved(false)
                            if (newPassword.length < 8) {
                                setPasswordError('Password must be at least 8 characters.')
                                return
                            }
                            if (newPassword !== confirmPassword) {
                                setPasswordError('Passwords do not match.')
                                return
                            }
                            setPasswordSaving(true)
                            void supabase.auth.updateUser({ password: newPassword }).then(({ error: err }) => {
                                setPasswordSaving(false)
                                if (err) {
                                    setPasswordError(err.message)
                                } else {
                                    setPasswordSaved(true)
                                    setNewPassword('')
                                    setConfirmPassword('')
                                    setTimeout(() => setPasswordSaved(false), 3000)
                                }
                            })
                        }}
                        disabled={passwordSaving || !newPassword}
                        className="flex items-center gap-1.5 rounded-lg bg-brand-primary px-4 py-2 text-xs font-medium text-black transition-colors hover:bg-brand-hover disabled:opacity-50"
                    >
                        {passwordSaving ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                            <Lock className="h-3 w-3" />
                        )}
                        Update Password
                    </button>

                    {passwordSaved && (
                        <p className="text-xs text-green-400">Password updated successfully.</p>
                    )}
                    {passwordError && (
                        <p className="text-xs text-red-400">{passwordError}</p>
                    )}
                </div>
            </div>

            {/* Account info */}
            <div className="rounded-lg border border-border bg-surface-card p-5">
                <h3 className="mb-2 text-sm font-medium text-gray-200">Account</h3>
                <div className="space-y-1 text-xs text-gray-500">
                    <p>User ID: <span className="font-mono text-gray-400">{user?.id ?? '—'}</span></p>
                    <p>Created: {user?.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}</p>
                    <p>Last sign-in: {user?.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleDateString() : '—'}</p>
                </div>
            </div>
        </div>
    )
}
