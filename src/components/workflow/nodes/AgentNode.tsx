// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import { Bot } from 'lucide-react'

export interface AgentNodeData {
    label: string
    model?: string
    role?: string
    avatarUrl?: string | null
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

function AgentNodeComponent({ data, selected }: NodeProps) {
    const nodeData = data as unknown as AgentNodeData
    const roleKey = nodeData.role ?? 'default'
    const borderClass = ROLE_COLORS[roleKey] ?? ROLE_COLORS.default
    const badge = ROLE_BADGES[roleKey]

    return (
        <div
            className={`workflow-agent-node rounded-xl border-2 bg-surface-card px-4 py-3 shadow-lg transition-all ${borderClass} ${selected ? 'ring-2 ring-brand-primary/50' : ''}`}
            style={{ minWidth: 180 }}
        >
            <Handle type="target" position={Position.Top} className="workflow-handle" />

            <div className="flex items-center gap-2.5">
                {nodeData.avatarUrl ? (
                    <img
                        src={nodeData.avatarUrl}
                        alt={nodeData.label}
                        className="h-8 w-8 rounded-lg object-cover"
                    />
                ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-muted">
                        <Bot className="h-4 w-4 text-brand-primary" />
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

            <div className="mt-2 flex">
                <span className={`rounded-full px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide ${badge.className}`}>
                    {badge.label}
                </span>
            </div>

            <Handle type="source" position={Position.Bottom} className="workflow-handle" />
        </div>
    )
}

export const AgentNode = memo(AgentNodeComponent)
