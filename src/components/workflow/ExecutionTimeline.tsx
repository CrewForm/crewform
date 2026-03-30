// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

/**
 * Horizontal execution timeline panel.
 *
 * Rendered below the canvas when a team run is active.
 * Each step is a clickable node on a horizontal rail.
 * Clicking a step pans the canvas to the corresponding agent node.
 *
 * Adapts to all three team modes:
 *  - Pipeline: sequential horizontal rail
 *  - Orchestrator: brain → fan-out workers
 *  - Collaboration: all agents as equal peers
 */

import { useState } from 'react'
import {
    Check,
    X,
    Loader2,
    Circle,
    ChevronDown,
    ChevronUp,
    Timer,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TeamRun, Agent, PipelineConfig, OrchestratorConfig, CollaborationConfig, TeamMode } from '@/types'
import type { ExecutionNodeState } from './useExecutionState'

interface ExecutionTimelineProps {
    run: TeamRun
    mode: TeamMode
    agents: Agent[]
    teamConfig: PipelineConfig | OrchestratorConfig | CollaborationConfig
    executionStates: Map<string, ExecutionNodeState> | null
    onStepClick: (nodeId: string) => void
}

const STATE_ICON: Record<ExecutionNodeState, typeof Check> = {
    idle: Circle,
    running: Loader2,
    completed: Check,
    failed: X,
}

const STATE_COLORS: Record<ExecutionNodeState, { node: string; line: string; text: string }> = {
    idle: {
        node: 'border-gray-700 bg-gray-800/50 text-gray-500',
        line: 'bg-gray-700',
        text: 'text-gray-500',
    },
    running: {
        node: 'border-blue-500 bg-blue-500/20 text-blue-400',
        line: 'bg-blue-500/50',
        text: 'text-blue-400',
    },
    completed: {
        node: 'border-green-500 bg-green-500/20 text-green-400',
        line: 'bg-green-500',
        text: 'text-green-400',
    },
    failed: {
        node: 'border-red-500 bg-red-500/20 text-red-400',
        line: 'bg-red-500',
        text: 'text-red-400',
    },
}

interface TimelineStep {
    nodeId: string
    label: string
    agentName: string
    state: ExecutionNodeState
}

function buildTimelineSteps(
    mode: TeamMode,
    teamConfig: PipelineConfig | OrchestratorConfig | CollaborationConfig,
    agents: Agent[],
    executionStates: Map<string, ExecutionNodeState> | null,
): TimelineStep[] {
    const steps: TimelineStep[] = []

    switch (mode) {
        case 'pipeline': {
            const config = teamConfig as PipelineConfig
            config.steps.forEach((step, idx) => {
                const nodeId = `agent-${idx}`
                const agent = agents.find((a) => a.id === step.agent_id)
                steps.push({
                    nodeId,
                    label: step.step_name || `Step ${idx + 1}`,
                    agentName: agent?.name ?? 'Unknown',
                    state: executionStates?.get(nodeId) ?? 'idle',
                })
            })
            break
        }
        case 'orchestrator': {
            const config = teamConfig as OrchestratorConfig
            const brainAgent = agents.find((a) => a.id === config.brain_agent_id)
            steps.push({
                nodeId: 'brain',
                label: 'Brain',
                agentName: brainAgent?.name ?? 'Brain',
                state: executionStates?.get('brain') ?? 'idle',
            })
            const workerIds = config.worker_agent_ids ?? []
            workerIds.forEach((agentId, idx) => {
                const agent = agents.find((a) => a.id === agentId)
                const nodeId = `worker-${idx}`
                steps.push({
                    nodeId,
                    label: `Worker ${idx + 1}`,
                    agentName: agent?.name ?? 'Worker',
                    state: executionStates?.get(nodeId) ?? 'idle',
                })
            })
            break
        }
        case 'collaboration': {
            const config = teamConfig as CollaborationConfig
            config.agent_ids.forEach((agentId, idx) => {
                const agent = agents.find((a) => a.id === agentId)
                const nodeId = `collab-${idx}`
                steps.push({
                    nodeId,
                    label: agent?.name ?? `Agent ${idx + 1}`,
                    agentName: agent?.name ?? 'Agent',
                    state: executionStates?.get(nodeId) ?? 'idle',
                })
            })
            break
        }
    }

    return steps
}

function getElapsed(start: string, end: string): string {
    const seconds = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000)
    if (seconds < 60) return `${seconds}s`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
}

export function ExecutionTimeline({
    run,
    mode,
    agents,
    teamConfig,
    executionStates,
    onStepClick,
}: ExecutionTimelineProps) {
    const [collapsed, setCollapsed] = useState(false)
    const steps = buildTimelineSteps(mode, teamConfig, agents, executionStates)
    const elapsed = run.started_at
        ? getElapsed(run.started_at, run.completed_at ?? new Date().toISOString())
        : null

    const statusLabel = run.status === 'running' ? 'Running' :
        run.status === 'completed' ? 'Completed' :
        run.status === 'failed' ? 'Failed' :
        run.status

    const statusColor = run.status === 'running' ? 'text-blue-400' :
        run.status === 'completed' ? 'text-green-400' :
        run.status === 'failed' ? 'text-red-400' :
        'text-gray-500'

    return (
        <div className="workflow-timeline">
            {/* Header bar */}
            <button
                type="button"
                onClick={() => setCollapsed(!collapsed)}
                className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-white/[0.02] transition-colors"
            >
                <div className="flex items-center gap-2">
                    {run.status === 'running' && (
                        <Loader2 className="h-3 w-3 animate-spin text-blue-400" />
                    )}
                    <span className="text-[11px] font-medium text-gray-400">Execution</span>
                    <span className={cn('text-[11px] font-medium capitalize', statusColor)}>
                        {statusLabel}
                    </span>
                </div>

                {elapsed && (
                    <span className="flex items-center gap-1 text-[10px] text-gray-600">
                        <Timer className="h-3 w-3" />
                        {elapsed}
                    </span>
                )}

                {run.tokens_total > 0 && (
                    <span className="text-[10px] text-gray-600">
                        {run.tokens_total.toLocaleString()} tokens
                    </span>
                )}

                <span className="ml-auto text-gray-600">
                    {collapsed ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </span>
            </button>

            {/* Timeline rail */}
            {!collapsed && (
                <div className="px-4 pb-3 overflow-x-auto">
                    <div className="flex items-center gap-0 min-w-fit">
                        {steps.map((step, idx) => {
                            const colors = STATE_COLORS[step.state]
                            const Icon = STATE_ICON[step.state]
                            const isLast = idx === steps.length - 1

                            return (
                                <div key={step.nodeId} className="flex items-center">
                                    {/* Step node */}
                                    <button
                                        type="button"
                                        onClick={() => onStepClick(step.nodeId)}
                                        className="workflow-timeline-step flex flex-col items-center gap-1 px-2"
                                        title={`${step.label} — ${step.agentName}`}
                                    >
                                        <div
                                            className={cn(
                                                'flex h-7 w-7 items-center justify-center rounded-full border-2 transition-all',
                                                colors.node,
                                            )}
                                        >
                                            <Icon
                                                className={cn(
                                                    'h-3.5 w-3.5',
                                                    step.state === 'running' && 'animate-spin',
                                                )}
                                            />
                                        </div>
                                        <span className={cn(
                                            'text-[9px] font-medium whitespace-nowrap max-w-[72px] truncate',
                                            colors.text,
                                        )}>
                                            {step.label}
                                        </span>
                                        <span className="text-[8px] text-gray-600 whitespace-nowrap max-w-[72px] truncate">
                                            {step.agentName}
                                        </span>
                                    </button>

                                    {/* Connector line */}
                                    {!isLast && (
                                        <div
                                            className={cn(
                                                'workflow-timeline-connector h-0.5 w-8 shrink-0',
                                                step.state === 'completed' ? colors.line : STATE_COLORS.idle.line,
                                            )}
                                        />
                                    )}
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}
        </div>
    )
}
