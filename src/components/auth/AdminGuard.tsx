// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useSuperAdmin } from '@/hooks/useAdmin'

interface AdminGuardProps {
    children: ReactNode
}

/**
 * Route guard that only renders children if user is a super admin.
 * Redirects to home if not authorized.
 */
export function AdminGuard({ children }: AdminGuardProps) {
    const { isSuperAdmin, isLoading } = useSuperAdmin()

    if (isLoading) {
        return (
            <div className="flex h-screen items-center justify-center bg-surface-primary">
                <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
            </div>
        )
    }

    if (!isSuperAdmin) {
        return <Navigate to="/" replace />
    }

    return <>{children}</>
}
