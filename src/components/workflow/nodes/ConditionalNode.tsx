// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

/**
 * Conditional (If-Else) routing node for the workflow canvas.
 *
 * Evaluates a condition against the previous node's output and routes
 * execution to different branches via separate output handles.
 */

import { memo, type CSSProperties } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import { GitBranch } from 'lucide-react'
import type { ExecutionNodeState } from '../useExecutionState'

export type ConditionOperator =
    | 'contains'
    | 'not_contains'
    | 'equals'
    | 'not_equals'
    | 'starts_with'
    | 'ends_with'
    | 'regex'
    | 'gt'
    | 'lt'
    | 'is_empty'
    | 'is_not_empty'
    | 'llm_judge'

export interface ConditionRule {
    field: string           // JSON path in previous output, e.g. "output" or "output.sentiment"
    operator: ConditionOperator
    value: string           // comparison value (ignored for is_empty / is_not_empty)
}

export interface ConditionalNodeData {
    label: string
    conditions: ConditionRule[]
    executionState?: ExecutionNodeState
    /** Which branch was taken during last execution */
    lastBranch?: 'true' | 'false' | null
    [key: string]: unknown
}

const OPERATOR_LABELS: Record<ConditionOperator, string> = {
    contains: 'contains',
    not_contains: 'not contains',
    equals: '==',
    not_equals: '!=',
    starts_with: 'starts with',
    ends_with: 'ends with',
    regex: 'regex',
    gt: '>',
    lt: '<',
    is_empty: 'is empty',
    is_not_empty: 'is not empty',
    llm_judge: 'LLM judge',
}

/** Execution state → border override */
const EXEC_BORDER: Record<ExecutionNodeState, string> = {
    idle: 'border-amber-500/50',
    running: 'border-blue-400/70 workflow-node-running',
    completed: 'border-green-500/60 workflow-node-completed',
    failed: 'border-red-500/60 workflow-node-failed',
}

function ConditionalNodeComponent({ data, selected }: NodeProps) {
    const nodeData = data as unknown as ConditionalNodeData
    const execState = nodeData.executionState ?? 'idle'
    const borderClass = EXEC_BORDER[execState]
    const condition = nodeData.conditions[0] as ConditionalNodeData['conditions'][number] | undefined

    // Build human-readable condition preview
    let conditionPreview = 'No condition set'
    if (condition != null) {
        const op = OPERATOR_LABELS[condition.operator]
        if (condition.operator === 'is_empty' || condition.operator === 'is_not_empty') {
            conditionPreview = `${condition.field} ${op}`
        } else if (condition.operator === 'llm_judge') {
            conditionPreview = `LLM: "${condition.value}"`
        } else {
            conditionPreview = `${condition.field} ${op} "${condition.value}"`
        }
    }

    // Diamond rotation styles
    const diamondStyle: CSSProperties = {
        minWidth: 170,
        position: 'relative',
    }

    return (
        <div
            className={`workflow-conditional-node workflow-glass-node rounded-xl border-2 px-4 py-3 shadow-lg transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl ${borderClass} ${selected ? 'ring-2 ring-amber-400/50' : ''}`}
            style={diamondStyle}
        >
            {/* Input handles */}
            <Handle type="target" position={Position.Top} id="top-target" className="workflow-handle" />
            <Handle type="target" position={Position.Left} id="left-target" className="workflow-handle workflow-handle-side" />

            {/* Node content */}
            <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 shrink-0">
                    <GitBranch className="h-4 w-4 text-amber-400" />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-gray-100">
                        {nodeData.label || 'Condition'}
                    </div>
                    <div className="truncate text-[10px] text-gray-500">
                        {conditionPreview}
                    </div>
                </div>
            </div>

            {/* Branch badges */}
            <div className="mt-2 flex items-center gap-1.5">
                <span className="rounded-full px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide bg-amber-500/15 text-amber-400">
                    If-Else
                </span>
                {nodeData.lastBranch && execState !== 'idle' && (
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-medium ${
                        nodeData.lastBranch === 'true'
                            ? 'bg-green-500/15 text-green-400'
                            : 'bg-red-500/15 text-red-400'
                    }`}>
                        → {nodeData.lastBranch === 'true' ? 'True' : 'False'}
                    </span>
                )}
            </div>

            {/* True output handle (bottom-left) */}
            <Handle
                type="source"
                position={Position.Bottom}
                id="true-source"
                className="workflow-handle workflow-handle-true"
                style={{ left: '35%' }}
            />

            {/* False output handle (bottom-right) */}
            <Handle
                type="source"
                position={Position.Bottom}
                id="false-source"
                className="workflow-handle workflow-handle-false"
                style={{ left: '65%' }}
            />

            {/* Right-side handles for LR layout */}
            <Handle type="source" position={Position.Right} id="right-source" className="workflow-handle workflow-handle-side" />

            {/* Branch labels below handles */}
            <div className="absolute -bottom-5 left-0 right-0 flex justify-between px-6 pointer-events-none">
                <span className="text-[8px] font-medium text-green-500/70">True</span>
                <span className="text-[8px] font-medium text-red-500/70">False</span>
            </div>
        </div>
    )
}

export const ConditionalNode = memo(ConditionalNodeComponent)
