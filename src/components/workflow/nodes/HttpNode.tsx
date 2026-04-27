// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

/**
 * HTTP Request node for the workflow canvas.
 *
 * Makes an HTTP request as a workflow step without requiring a full agent.
 * Supports GET, POST, PUT, DELETE with configurable headers and body.
 */

import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import { Globe, Check, X, Loader2 } from 'lucide-react'
import type { ExecutionNodeState } from '../useExecutionState'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'

export interface HttpHeader {
    key: string
    value: string
}

export interface HttpNodeData {
    label: string
    url: string
    method: HttpMethod
    headers: HttpHeader[]
    body: string
    timeout: number          // seconds, default 30
    executionState?: ExecutionNodeState
    /** Last response status code from execution */
    lastStatusCode?: number | null
    [key: string]: unknown
}

const METHOD_COLORS: Record<HttpMethod, { bg: string; text: string }> = {
    GET: { bg: 'bg-green-500/15', text: 'text-green-400' },
    POST: { bg: 'bg-blue-500/15', text: 'text-blue-400' },
    PUT: { bg: 'bg-amber-500/15', text: 'text-amber-400' },
    DELETE: { bg: 'bg-red-500/15', text: 'text-red-400' },
    PATCH: { bg: 'bg-purple-500/15', text: 'text-purple-400' },
}

/** Execution state → border override */
const EXEC_BORDER: Record<ExecutionNodeState, string> = {
    idle: 'border-cyan-500/40',
    running: 'border-blue-400/70 workflow-node-running',
    completed: 'border-green-500/60 workflow-node-completed',
    failed: 'border-red-500/60 workflow-node-failed',
}

/** Execution state → status badge */
const EXEC_BADGE: Record<ExecutionNodeState, { label: string; className: string; Icon: typeof Check } | null> = {
    idle: null,
    running: { label: 'Requesting…', className: 'bg-blue-500/15 text-blue-400', Icon: Loader2 },
    completed: { label: 'Done', className: 'bg-green-500/15 text-green-400', Icon: Check },
    failed: { label: 'Failed', className: 'bg-red-500/15 text-red-400', Icon: X },
}

function HttpNodeComponent({ data, selected }: NodeProps) {
    const nodeData = data as unknown as HttpNodeData
    const execState = nodeData.executionState ?? 'idle'
    const borderClass = EXEC_BORDER[execState]
    const methodStyle = METHOD_COLORS[nodeData.method]
    const execBadge = EXEC_BADGE[execState]

    // Shorten URL for display
    let urlDisplay = nodeData.url || 'No URL set'
    try {
        if (nodeData.url) {
            const u = new URL(nodeData.url)
            urlDisplay = u.hostname + (u.pathname !== '/' ? u.pathname : '')
            if (urlDisplay.length > 28) urlDisplay = urlDisplay.slice(0, 28) + '…'
        }
    } catch {
        // Not a valid URL yet, show raw
        if (urlDisplay.length > 28) urlDisplay = urlDisplay.slice(0, 28) + '…'
    }

    return (
        <div
            className={`workflow-http-node workflow-glass-node rounded-xl border-2 px-4 py-3 shadow-lg transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl ${borderClass} ${selected ? 'ring-2 ring-cyan-400/50' : ''}`}
            style={{ minWidth: 180 }}
        >
            {/* Input handles */}
            <Handle type="target" position={Position.Top} id="top-target" className="workflow-handle" />
            <Handle type="target" position={Position.Left} id="left-target" className="workflow-handle workflow-handle-side" />

            {/* Node content */}
            <div className="flex items-center gap-2.5">
                <div className="relative">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/15">
                        <Globe className={`h-4 w-4 ${
                            execState === 'running' ? 'text-blue-400' :
                            execState === 'completed' ? 'text-green-400' :
                            execState === 'failed' ? 'text-red-400' :
                            'text-cyan-400'
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
                <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-gray-100">
                        {nodeData.label || 'HTTP Request'}
                    </div>
                    <div className="truncate text-[10px] text-gray-500">
                        {urlDisplay}
                    </div>
                </div>
            </div>

            {/* Method badge + execution status */}
            <div className="mt-2 flex items-center gap-1.5">
                <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${methodStyle.bg} ${methodStyle.text}`}>
                    {nodeData.method}
                </span>
                {nodeData.lastStatusCode && execState !== 'idle' && (
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-medium ${
                        nodeData.lastStatusCode >= 200 && nodeData.lastStatusCode < 300
                            ? 'bg-green-500/15 text-green-400'
                            : nodeData.lastStatusCode >= 400
                                ? 'bg-red-500/15 text-red-400'
                                : 'bg-amber-500/15 text-amber-400'
                    }`}>
                        {nodeData.lastStatusCode}
                    </span>
                )}
                {execBadge && !nodeData.lastStatusCode && (
                    <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium ${execBadge.className}`}>
                        <execBadge.Icon className={`h-2.5 w-2.5 ${execState === 'running' ? 'animate-spin' : ''}`} />
                        {execBadge.label}
                    </span>
                )}
            </div>

            {/* Output handles */}
            <Handle type="source" position={Position.Bottom} id="bottom-source" className="workflow-handle" />
            <Handle type="source" position={Position.Right} id="right-source" className="workflow-handle workflow-handle-side" />
        </div>
    )
}

export const HttpNode = memo(HttpNodeComponent)
