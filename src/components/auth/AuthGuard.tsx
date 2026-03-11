// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useEffect, type ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

interface AuthGuardProps {
  children: ReactNode
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth', { replace: true, state: { from: location.pathname } })
      return
    }

    // Beta gate: if user is a beta signup that hasn't been approved, redirect
    if (!loading && user) {
      const meta = user.user_metadata as Record<string, unknown>
      if (meta.is_beta === true && meta.beta_approved !== true) {
        navigate('/beta-pending', { replace: true })
      }
    }
  }, [user, loading, navigate, location.pathname])

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-950">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          <span className="text-sm text-gray-400">Loading...</span>
        </div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  // Block unapproved beta users from seeing the app
  const meta = user.user_metadata as Record<string, unknown>
  if (meta.is_beta === true && meta.beta_approved !== true) {
    return null
  }

  return <>{children}</>
}
