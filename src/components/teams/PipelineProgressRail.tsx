// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { Check, X, Loader2, Minus, Circle, GitBranch } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PipelineStep, Agent, TeamRunStatus } from '@/types'

type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped'

interface PipelineProgressRailProps {
    steps: PipelineStep[]
    currentStepIdx: number | null
    runStatus: TeamRunStatus
    agents: Agent[]
}

function getStepStatus(
    stepIndex: number,
    currentStepIdx: number | null,
    runStatus: TeamRunStatus,
): StepStatus {
    if (runStatus === 'completed') return 'completed'
    if (runStatus === 'failed') {
        if (currentStepIdx === null) return 'pending'
        if (stepIndex < currentStepIdx) return 'completed'
        if (stepIndex === currentStepIdx) return 'failed'
        return 'pending'
    }
    if (currentStepIdx === null) return 'pending'
    if (stepIndex < currentStepIdx) return 'completed'
    if (stepIndex === currentStepIdx) return 'running'
    return 'pending'
}

const STEP_ICON: Record<StepStatus, typeof Check> = {
    pending: Circle,
    running: Loader2,
    completed: Check,
    failed: X,
    skipped: Minus,
}

const STEP_COLORS: Record<StepStatus, string> = {
    pending: 'border-gray-700 bg-gray-800 text-gray-500',
    running: 'border-blue-500 bg-blue-500/20 text-blue-400',
    completed: 'border-green-500 bg-green-500/20 text-green-400',
    failed: 'border-red-500 bg-red-500/20 text-red-400',
    skipped: 'border-yellow-500 bg-yellow-500/20 text-yellow-400',
}

const LINE_COLORS: Record<StepStatus, string> = {
    pending: 'bg-gray-700',
    running: 'bg-blue-500/50',
    completed: 'bg-green-500',
    failed: 'bg-red-500',
    skipped: 'bg-yellow-500',
}

/**
 * Vertical pipeline progress rail.
 * Shows each step as a node with connecting lines.
 * For fan-out steps, renders parallel branches and merge node.
 * Updates in real-time via currentStepIdx.
 */
export function PipelineProgressRail({ steps, currentStepIdx, runStatus, agents }: PipelineProgressRailProps) {
    return (
        <div className="flex flex-col">
            {steps.map((step, index) => {
                const status = getStepStatus(index, currentStepIdx, runStatus)
                const isLast = index === steps.length - 1
                const isFanOut = step.type === 'fan_out'

                if (isFanOut) {
                    return (
                        <FanOutProgressNode
                            key={`fanout-${index}`}
                            step={step}
                            status={status}
                            agents={agents}
                            isLast={isLast}
                        />
                    )
                }

                const Icon = STEP_ICON[status]
                const agent = agents.find((a) => a.id === step.agent_id)

                return (
                    <div key={`${step.agent_id}-${index}`} className="flex items-start gap-3">
                        {/* Rail column */}
                        <div className="flex flex-col items-center">
                            {/* Node */}
                            <div
                                className={cn(
                                    'flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all',
                                    STEP_COLORS[status],
                                )}
                            >
                                <Icon
                                    className={cn(
                                        'h-4 w-4',
                                        status === 'running' && 'animate-spin',
                                    )}
                                />
                            </div>
                            {/* Connecting line */}
                            {!isLast && (
                                <div
                                    className={cn(
                                        'w-0.5 flex-1 min-h-[32px] transition-colors',
                                        LINE_COLORS[status === 'completed' ? 'completed' : 'pending'],
                                    )}
                                />
                            )}
                        </div>

                        {/* Step info */}
                        <div className="pb-6 pt-1">
                            <p className={cn(
                                'text-sm font-medium',
                                status === 'running' ? 'text-blue-400' :
                                    status === 'completed' ? 'text-green-400' :
                                        status === 'failed' ? 'text-red-400' :
                                            'text-gray-400',
                            )}>
                                {step.step_name}
                            </p>
                            <p className="text-xs text-gray-500">
                                {agent?.name ?? 'Unknown agent'}
                            </p>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

// ─── Fan-Out Progress Node ───────────────────────────────────────────────────

interface FanOutProgressNodeProps {
    step: PipelineStep
    status: StepStatus
    agents: Agent[]
    isLast: boolean
}

function FanOutProgressNode({ step, status, agents }: FanOutProgressNodeProps) {
    const parallelAgentIds = step.parallel_agents ?? []

    return (
        <div className="flex items-start gap-3">
            {/* Rail column */}
            <div className="flex flex-col items-center">
                {/* Fan-out node */}
                <div
                    className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all',
                        status === 'running' ? 'border-amber-500 bg-amber-500/20 text-amber-400' :
                            status === 'completed' ? 'border-green-500 bg-green-500/20 text-green-400' :
                                status === 'failed' ? 'border-red-500 bg-red-500/20 text-red-400' :
                                    'border-amber-500/40 bg-gray-800 text-amber-400/60',
                    )}
                >
                    <GitBranch className={cn('h-4 w-4', status === 'running' && 'animate-pulse')} />
                </div>

                {/* Branching lines */}
                <div className="w-0.5 min-h-[8px] bg-amber-500/30" />
            </div>

            {/* Fan-out info + branches */}
            <div className="pb-2 pt-1 flex-1">
                <p className={cn(
                    'text-sm font-medium',
                    status === 'running' ? 'text-amber-400' :
                        status === 'completed' ? 'text-green-400' :
                            status === 'failed' ? 'text-red-400' :
                                'text-gray-400',
                )}>
                    {step.step_name}
                </p>
                <p className="text-xs text-gray-500">
                    {parallelAgentIds.length} parallel branches
                </p>

                {/* Parallel branch indicators */}
                <div className="mt-2 flex flex-wrap gap-1.5">
                    {parallelAgentIds.map((agentId) => {
                        const agent = agents.find((a) => a.id === agentId)
                        return (
                            <div
                                key={agentId}
                                className={cn(
                                    'flex items-center gap-1.5 rounded-md px-2 py-1 text-xs',
                                    status === 'completed' ? 'bg-green-500/10 text-green-400' :
                                        status === 'running' ? 'bg-amber-500/10 text-amber-400' :
                                            status === 'failed' ? 'bg-red-500/10 text-red-400' :
                                                'bg-gray-800 text-gray-500',
                                )}
                            >
                                {status === 'running' ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                ) : status === 'completed' ? (
                                    <Check className="h-3 w-3" />
                                ) : status === 'failed' ? (
                                    <X className="h-3 w-3" />
                                ) : (
                                    <Circle className="h-3 w-3" />
                                )}
                                {agent?.name ?? 'Agent'}
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )

    // NOTE: The merge node is rendered implicitly as part of the fan-out step.
    // Since merging happens within the same step index, the progress rail treats
    // the entire fan-out + merge as one atomic visual unit.
}
