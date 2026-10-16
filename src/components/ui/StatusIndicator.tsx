// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { cn } from '@/lib/utils'
import type { AgentStatus } from '@/types'

interface StatusIndicatorProps {
    status: AgentStatus
    size?: 'sm' | 'md' | 'lg'
    className?: string
}

const statusConfig: Record<AgentStatus, { color: string; pulse: boolean; label: string }> = {
    idle: { color: 'bg-status-success', pulse: false, label: 'Idle' },
    busy: { color: 'bg-status-warning-text', pulse: true, label: 'Busy' },
    offline: { color: 'bg-status-idle', pulse: false, label: 'Offline' },
}

const sizeClasses = {
    sm: 'h-2 w-2',
    md: 'h-2.5 w-2.5',
    lg: 'h-3 w-3',
}

/**
 * Reusable status dot indicator.
 * - idle: solid green
 * - busy: pulsing yellow
 * - offline: solid grey
 */
export function StatusIndicator({ status, size = 'md', className }: StatusIndicatorProps) {
    const config = statusConfig[status]

    return (
        <span
            className={cn(
                'inline-block shrink-0 rounded-full',
                sizeClasses[size],
                config.color,
                config.pulse && 'status-busy',
                className,
            )}
            aria-label={config.label}
            role="status"
        />
    )
}
