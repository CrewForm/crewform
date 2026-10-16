// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import type { ReactNode } from 'react'
import { useCurrentRole } from '@/hooks/useCurrentRole'
import type { WorkspaceRole } from '@/types'

interface RoleGateProps {
    /** Minimum role required to see the children */
    minRole: WorkspaceRole
    /** Content to render if user meets the role requirement */
    children: ReactNode
    /** Optional fallback when the user doesn't have permission */
    fallback?: ReactNode
}

/**
 * Conditionally renders children based on the current user's workspace role.
 * Role hierarchy: owner > admin > manager > member > viewer
 *
 * Usage:
 *   <RoleGate minRole="manager">
 *     <CreateAgentButton />
 *   </RoleGate>
 */
export function RoleGate({ minRole, children, fallback = null }: RoleGateProps) {
    const { hasMinRole, isLoading } = useCurrentRole()

    if (isLoading) return null
    if (!hasMinRole(minRole)) return <>{fallback}</>

    return <>{children}</>
}
