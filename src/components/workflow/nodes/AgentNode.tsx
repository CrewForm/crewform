// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import { Bot, Check, X, Loader2 } from 'lucide-react'
import type { ExecutionNodeState } from '../useExecutionState'

export interface AgentNodeData {
    label: string
    model?: string
    role?: string
    avatarUrl?: string | null
    executionState?: ExecutionNodeState
    [key: string]: unknown
}

const ROLE_COLORS: Record<string, string> = {
    brain: 'border-purple-500/60 shadow-purple-500/10',
    orchestrator: 'border-purple-500/60 shadow-purple-500/10',
    worker: 'border-blue-500/60 shadow-blue-500/10',
    reviewer: 'border-amber-500/60 shadow-amber-500/10',
    default: 'border-brand-primary/40 shadow-brand-primary/10',
}

const ROLE_BADGES: Record<string, { label: string; className: string }> = {
    brain: { label: 'Brain', className: 'bg-purple-500/15 text-purple-400' },
    orchestrator: { label: 'Brain', className: 'bg-purple-500/15 text-purple-400' },
    worker: { label: 'Worker', className: 'bg-blue-500/15 text-blue-400' },
    reviewer: { label: 'Reviewer', className: 'bg-amber-500/15 text-amber-400' },
    default: { label: 'Agent', className: 'bg-gray-500/15 text-gray-400' },
}

/** Execution state → border/glow override */
const EXEC_BORDER: Record<ExecutionNodeState, string> = {
    idle: '',
    running: 'border-blue-400/70 workflow-node-running',
    completed: 'border-green-500/60 workflow-node-completed',
    failed: 'border-red-500/60 workflow-node-failed',
}

/** Execution state → status badge */
const EXEC_BADGE: Record<ExecutionNodeState, { label: string; className: string; Icon: typeof Check } | null> = {
    idle: null,
    running: { label: 'Running', className: 'bg-blue-500/15 text-blue-400', Icon: Loader2 },
    completed: { label: 'Done', className: 'bg-green-500/15 text-green-400', Icon: Check },
    failed: { label: 'Failed', className: 'bg-red-500/15 text-red-400', Icon: X },
}

function AgentNodeComponent({ data, selected }: NodeProps) {
    const nodeData = data as unknown as AgentNodeData
    const roleKey = nodeData.role ?? 'default'
    const execState = nodeData.executionState ?? 'idle'

    // Execution state overrides the role border color when active
    const borderClass = execState !== 'idle'
        ? EXEC_BORDER[execState]
        : (ROLE_COLORS[roleKey] ?? ROLE_COLORS.default)

    const roleBadge = ROLE_BADGES[roleKey]
    const execBadge = EXEC_BADGE[execState]

    return (
        <div
            className={`workflow-agent-node rounded-xl border-2 bg-surface-card px-4 py-3 shadow-lg transition-all ${borderClass} ${selected ? 'ring-2 ring-brand-primary/50' : ''}`}
            style={{ minWidth: 180 }}
        >
            <Handle type="target" position={Position.Top} className="workflow-handle" />

            <div className="flex items-center gap-2.5">
                {nodeData.avatarUrl ? (
                    <div className="relative">
                        <img
                            src={nodeData.avatarUrl}
                            alt={nodeData.label}
                            className="h-8 w-8 rounded-lg object-cover"
                        />
                        {execState === 'running' && (
                            <div className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 shadow-lg shadow-blue-500/50">
                                <Loader2 className="h-2.5 w-2.5 animate-spin text-white" />
                            </div>
                        )}
                        {execState === 'completed' && (
                            <div className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-green-500 shadow-lg shadow-green-500/50">
                                <Check className="h-2.5 w-2.5 text-white" />
                            </div>
                        )}
                        {execState === 'failed' && (
                            <div className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 shadow-lg shadow-red-500/50">
                                <X className="h-2.5 w-2.5 text-white" />
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="relative">
                        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                            execState === 'running' ? 'bg-blue-500/15' :
                            execState === 'completed' ? 'bg-green-500/15' :
                            execState === 'failed' ? 'bg-red-500/15' :
                            'bg-brand-muted'
                        }`}>
                            <Bot className={`h-4 w-4 ${
                                execState === 'running' ? 'text-blue-400' :
                                execState === 'completed' ? 'text-green-400' :
                                execState === 'failed' ? 'text-red-400' :
                                'text-brand-primary'
                            }`} />
                        </div>
                        {execState === 'running' && (
                            <div className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 shadow-lg shadow-blue-500/50">
                                <Loader2 className="h-2.5 w-2.5 animate-spin text-white" />
                            </div>
                        )}
                        {execState === 'completed' && (
                            <div className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-green-500 shadow-lg shadow-green-500/50">
                                <Check className="h-2.5 w-2.5 text-white" />
                            </div>
                        )}
                        {execState === 'failed' && (
                            <div className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 shadow-lg shadow-red-500/50">
                                <X className="h-2.5 w-2.5 text-white" />
                            </div>
                        )}
                    </div>
                )}
                <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-gray-100">
                        {nodeData.label}
                    </div>
                    {nodeData.model ? (
                        <div className="truncate text-[10px] text-gray-500">
                            {nodeData.model}
                        </div>
                    ) : null}
                </div>
            </div>

            <div className="mt-2 flex items-center gap-1.5">
                <span className={`rounded-full px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide ${roleBadge.className}`}>
                    {roleBadge.label}
                </span>
                {execBadge && (
                    <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium ${execBadge.className}`}>
                        <execBadge.Icon className={`h-2.5 w-2.5 ${execState === 'running' ? 'animate-spin' : ''}`} />
                        {execBadge.label}
                    </span>
                )}
            </div>

            <Handle type="source" position={Position.Bottom} className="workflow-handle" />
        </div>
    )
}

export const AgentNode = memo(AgentNodeComponent)
