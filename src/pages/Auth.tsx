// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useState, useEffect } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { LoginForm } from '@/components/auth/LoginForm'
import { SignupForm } from '@/components/auth/SignupForm'
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm'
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm'

type AuthMode = 'login' | 'signup' | 'forgot-password' | 'reset-password'

export function Auth() {
  const location = useLocation()
  const navigate = useNavigate()

  // Determine initial mode from path
  function getInitialMode(): AuthMode {
    if (location.pathname === '/auth/reset-password') return 'reset-password'
    if (location.pathname === '/auth/forgot-password') return 'forgot-password'
    if (location.pathname === '/auth/signup') return 'signup'
    return 'login'
  }

  const [mode, setMode] = useState<AuthMode>(getInitialMode)
  const {
    user,
    loading,
    signIn,
    signUp,
    signInWithOAuth,
    resetPassword,
    updatePassword,
  } = useAuth()

  useEffect(() => {
    if (!loading && user && mode !== 'reset-password') {
      navigate('/', { replace: true })
    }
  }, [user, loading, navigate, mode])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    )
  }

  function getTitle(): string {
    switch (mode) {
      case 'signup':
        return 'Create your account'
      case 'forgot-password':
        return 'Reset your password'
      case 'reset-password':
        return 'Set new password'
      default:
        return 'Sign in to your account'
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-950">
      <div className="w-full max-w-md rounded-lg border border-gray-800 bg-gray-900 p-8">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center">
          <img src="/crewform-icon.png" alt="CrewForm" className="mb-4 h-12 w-12 rounded-xl" />
          <h1 className="text-2xl font-semibold text-gray-100">CrewForm</h1>
          <p className="mt-2 text-sm text-gray-400">{getTitle()}</p>
        </div>

        {mode === 'login' && (
          <LoginForm
            onSignIn={signIn}
            onOAuth={signInWithOAuth}
            onToggle={() => setMode('signup')}
            onForgotPassword={() => setMode('forgot-password')}
          />
        )}

        {mode === 'signup' && (
          <SignupForm
            onSignUp={signUp}
            onToggle={() => setMode('login')}
          />
        )}

        {mode === 'forgot-password' && (
          <ForgotPasswordForm
            onResetPassword={resetPassword}
            onBackToLogin={() => setMode('login')}
          />
        )}

        {mode === 'reset-password' && (
          <ResetPasswordForm
            onUpdatePassword={updatePassword}
          />
        )}
      </div>
      <p className="mt-4 text-center text-xs text-gray-600">
        By continuing, you agree to our{' '}
        <Link to="/terms" className="text-gray-500 hover:text-gray-300">Terms of Service</Link>
        {' '}and{' '}
        <Link to="/privacy" className="text-gray-500 hover:text-gray-300">Privacy Policy</Link>.
      </p>
    </div>
  )
}
