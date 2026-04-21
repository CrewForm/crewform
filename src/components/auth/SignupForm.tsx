// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useState, useRef, type FormEvent } from 'react'
import type { AuthError } from '@supabase/supabase-js'
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile'

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined

interface SignupFormProps {
  onSignUp: (email: string, password: string, fullName?: string, captchaToken?: string) => Promise<{ error: AuthError | null }>
  onToggle: () => void
}

export function SignupForm({ onSignUp, onToggle }: SignupFormProps) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const turnstileRef = useRef<TurnstileInstance | null>(null)

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

    // If Turnstile is enabled, require a token
    if (TURNSTILE_SITE_KEY && !captchaToken) {
      setError('Please complete the verification')
      return
    }

    setLoading(true)
    const { error: authError } = await onSignUp(
      email,
      password,
      fullName.trim() || undefined,
      captchaToken ?? undefined,
    )
    if (authError) {
      setError(authError.message)
      // Reset Turnstile so user can retry
      turnstileRef.current?.reset()
      setCaptchaToken(null)
    } else {
      setSuccess(true)
    }
    setLoading(false)
  }

  if (success) {
    return (
      <div className="space-y-4 text-center">
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-6">
          <h3 className="text-lg font-medium text-green-400">Check your email</h3>
          <p className="mt-2 text-sm text-gray-400">
            We&apos;ve sent a confirmation link to <strong className="text-gray-300">{email}</strong>.
            Click it to activate your account.
          </p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="text-sm text-blue-400 hover:text-blue-300"
        >
          Back to sign in
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="signup-name" className="mb-1.5 block text-sm font-medium text-gray-300">
          Full Name
        </label>
        <input
          id="signup-name"
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="John Doe"
          className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-gray-200 placeholder-gray-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          autoFocus
        />
      </div>

      <div>
        <label htmlFor="signup-email" className="mb-1.5 block text-sm font-medium text-gray-300">
          Email
        </label>
        <input
          id="signup-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-gray-200 placeholder-gray-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div>
        <label htmlFor="signup-password" className="mb-1.5 block text-sm font-medium text-gray-300">
          Password
        </label>
        <input
          id="signup-password"
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-gray-200 placeholder-gray-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div>
        <label htmlFor="signup-confirm" className="mb-1.5 block text-sm font-medium text-gray-300">
          Confirm Password
        </label>
        <input
          id="signup-confirm"
          type="password"
          required
          minLength={8}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="••••••••"
          className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-gray-200 placeholder-gray-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Cloudflare Turnstile — invisible bot protection */}
      {TURNSTILE_SITE_KEY && (
        <div className="flex justify-center">
          <Turnstile
            ref={turnstileRef}
            siteKey={TURNSTILE_SITE_KEY}
            onSuccess={(token) => setCaptchaToken(token)}
            onError={() => {
              setCaptchaToken(null)
              setError('Verification failed. Please try again.')
            }}
            onExpire={() => setCaptchaToken(null)}
            options={{
              theme: 'dark',
              size: 'flexible',
            }}
          />
        </div>
      )}

      <button
        type="submit"
        disabled={loading || (!!TURNSTILE_SITE_KEY && !captchaToken)}
        className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? 'Creating account...' : 'Create Account'}
      </button>

      <p className="mt-6 text-center text-xs text-gray-500">
        Already have an account?{' '}
        <button
          type="button"
          onClick={onToggle}
          className="text-blue-400 hover:text-blue-300"
        >
          Sign in
        </button>
      </p>
    </form>
  )
}
