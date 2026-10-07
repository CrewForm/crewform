// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { Link } from 'react-router-dom'
import { Clock, Coins, Hash, Loader2, CheckCircle2, XCircle, CirclePause, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useRerunTeamRun } from '@/hooks/useRerunTeamRun'
import type { TeamRun, TeamRunStatus } from '@/types'

const STATUS_CONFIG: Record<TeamRunStatus, { label: string; icon: typeof CheckCircle2; className: string }> = {
    draft: { label: 'Draft', icon: Clock, className: 'text-gray-400 bg-gray-500/10' },
    pending: { label: 'Pending', icon: Clock, className: 'text-gray-400 bg-gray-500/10' },
    running: { label: 'Running', icon: Loader2, className: 'text-blue-400 bg-blue-500/10 animate-pulse' },
    paused: { label: 'Paused', icon: CirclePause, className: 'text-yellow-400 bg-yellow-500/10' },
    completed: { label: 'Completed', icon: CheckCircle2, className: 'text-green-400 bg-green-500/10' },
    failed: { label: 'Failed', icon: XCircle, className: 'text-red-400 bg-red-500/10' },
    cancelled: { label: 'Cancelled', icon: XCircle, className: 'text-gray-500 bg-gray-500/10' },
}

interface TeamRunCardProps {
    run: TeamRun
    teamId: string
    stepCount: number
}

/**
 * Card for a team run — shows status, input preview, step progress, elapsed time, cost.
 */
export function TeamRunCard({ run, teamId, stepCount }: TeamRunCardProps) {
    const status = STATUS_CONFIG[run.status]
    const StatusIcon = status.icon
    const rerunMutation = useRerunTeamRun()

    const canRerun = run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled'

    const elapsed = run.started_at
        ? getElapsed(run.started_at, run.completed_at ?? new Date().toISOString())
        : '—'

    function handleRerun(e: React.MouseEvent) {
        e.preventDefault()
        e.stopPropagation()
        rerunMutation.mutate({ runId: run.id, teamId })
    }

    return (
        <Link
            to={`/teams/${teamId}/runs/${run.id}`}
            className="flex items-center gap-4 rounded-lg border border-border bg-surface-card px-4 py-3 transition-all hover:border-brand-primary/40 hover:shadow-sm"
        >
            {/* Status */}
            <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg', status.className)}>
                <StatusIcon className={cn('h-4 w-4', run.status === 'running' && 'animate-spin')} />
            </div>

            {/* Input preview */}
            <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium text-gray-200">
                    {run.input_task}
                </p>
                <p className="text-xs text-gray-500">
                    {new Date(run.created_at).toLocaleString()}
                </p>
            </div>

            {/* Step progress */}
            <div className="flex items-center gap-1 text-xs text-gray-500">
                <Hash className="h-3 w-3" />
                {run.current_step_idx !== null ? run.current_step_idx + 1 : 0}/{stepCount}
            </div>

            {/* Elapsed */}
            <div className="flex items-center gap-1 text-xs text-gray-500">
                <Clock className="h-3 w-3" />
                {elapsed}
            </div>

            {/* Cost */}
            {run.cost_estimate_usd > 0 && (
                <div className="flex items-center gap-1 text-xs text-gray-500">
                    <Coins className="h-3 w-3" />
                    ${run.cost_estimate_usd.toFixed(4)}
                </div>
            )}

            {/* Rerun button */}
            {canRerun && (
                <button
                    onClick={handleRerun}
                    disabled={rerunMutation.isPending}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-brand-primary hover:bg-brand-primary/10 transition-colors disabled:opacity-50"
                    title="Re-run this pipeline"
                >
                    {rerunMutation.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                        <RotateCcw className="h-3.5 w-3.5" />
                    )}
                    Rerun
                </button>
            )}
        </Link>
    )
}

function getElapsed(start: string, end: string): string {
    const seconds = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000)
    if (seconds < 60) return `${seconds}s`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
}

