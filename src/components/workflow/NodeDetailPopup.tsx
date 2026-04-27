// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

/**
 * On-canvas detail popup for agent nodes.
 *
 * Appears next to the selected node, showing agent details,
 * step config (pipeline), execution state, I/O inspector, and quick actions.
 * Uses glassmorphism styling for a premium floating card look.
 */

import { useEffect, useRef, useState } from 'react'
import { useReactFlow } from '@xyflow/react'
import type { Node } from '@xyflow/react'
import {
    Bot,
    Trash2,
    ExternalLink,
    Cpu,
    Wrench,
    AlertTriangle,
    Check,
    Loader2,
    X,
    ArrowDownToLine,
    ArrowUpFromLine,
    ChevronDown,
    ChevronRight,
    GitBranch,
    Globe,
} from 'lucide-react'
import type { Agent, Team, PipelineConfig, PipelineStep, TeamMessage } from '@/types'
import type { AgentNodeData } from './nodes/AgentNode'
import type { ConditionalNodeData, ConditionOperator } from './nodes/ConditionalNode'
import type { HttpNodeData } from './nodes/HttpNode'
import type { ExecutionNodeState } from './useExecutionState'

interface NodeDetailPopupProps {
    node: Node
    team: Team
    agents: Agent[]
    executionStates: Map<string, ExecutionNodeState> | null
    runMessages?: TeamMessage[]
    onDelete?: (nodeId: string) => void
    onClose: () => void
}

const EXEC_STATUS_CONFIG: Record<ExecutionNodeState, { label: string; className: string; Icon: typeof Check }> = {
    idle: { label: 'Idle', className: 'text-gray-500', Icon: Bot },
    running: { label: 'Running…', className: 'text-blue-400', Icon: Loader2 },
    completed: { label: 'Completed', className: 'text-green-400', Icon: Check },
    failed: { label: 'Failed', className: 'text-red-400', Icon: X },
}

export function NodeDetailPopup({ node, team, agents, executionStates, runMessages, onDelete, onClose }: NodeDetailPopupProps) {
    const popupRef = useRef<HTMLDivElement>(null)
    const { getNodesBounds, flowToScreenPosition } = useReactFlow()
    const [showInput, setShowInput] = useState(false)
    const [showOutput, setShowOutput] = useState(false)

    const nodeData = node.data as unknown as AgentNodeData
    const isAgentNode = node.type === 'agentNode'
    const execState = executionStates?.get(node.id) ?? 'idle'
    const execConfig = EXEC_STATUS_CONFIG[execState]

    // Find the full agent object
    const agentId = (node.data as { agentId?: string }).agentId
    const agent = agentId ? agents.find((a) => a.id === agentId) : agents.find((a) => a.name === nodeData.label)

    // Pipeline step config
    const stepIndex = node.id.startsWith('agent-') ? parseInt(node.id.replace('agent-', ''), 10) : -1
    const pipelineConfig = team.mode === 'pipeline' ? (team.config as PipelineConfig) : null
    const stepConfig: PipelineStep | null = pipelineConfig && stepIndex >= 0
        ? (pipelineConfig.steps[stepIndex] ?? null)
        : null

    // Can delete?
    const protectedIds = new Set(['start', 'end', 'brain'])
    const isBrain = nodeData.role === 'brain' || nodeData.role === 'orchestrator'
    const canDelete = (isAgentNode || node.type === 'conditionalNode' || node.type === 'httpNode')
        && !protectedIds.has(node.id) && !(isBrain && team.mode === 'orchestrator')

    // I/O: filter messages for this agent
    const { inputText, outputText } = getNodeIO(agentId, runMessages)
    const hasIO = inputText || outputText

    // Calculate screen position of popup
    const bounds = getNodesBounds([node])
    const screenPos = flowToScreenPosition({ x: bounds.x + bounds.width + 12, y: bounds.y })

    // Close on outside click
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (popupRef.current && !popupRef.current.contains(e.target as HTMLElement)) {
                onClose()
            }
        }
        function handleEscape(e: KeyboardEvent) {
            if (e.key === 'Escape') onClose()
        }
        document.addEventListener('mousedown', handleClickOutside)
        document.addEventListener('keydown', handleEscape)
        return () => {
            document.removeEventListener('mousedown', handleClickOutside)
            document.removeEventListener('keydown', handleEscape)
        }
    }, [onClose])

    if (!isAgentNode && node.type !== 'conditionalNode' && node.type !== 'httpNode') return null

    return (
        <div
            ref={popupRef}
            className="workflow-glass-popup workflow-popup-enter fixed z-50 w-72 rounded-xl p-4"
            style={{
                left: Math.min(screenPos.x, window.innerWidth - 320),
                top: Math.max(screenPos.y, 8),
                maxHeight: 'calc(100vh - 32px)',
                overflowY: 'auto',
            }}
        >
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2.5">
                    {nodeData.avatarUrl ? (
                        <img
                            src={nodeData.avatarUrl}
                            alt={nodeData.label}
                            className="h-10 w-10 rounded-lg object-cover"
                        />
                    ) : node.type === 'conditionalNode' ? (
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/15">
                            <GitBranch className="h-5 w-5 text-amber-400" />
                        </div>
                    ) : node.type === 'httpNode' ? (
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/15">
                            <Globe className="h-5 w-5 text-cyan-400" />
                        </div>
                    ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-muted">
                            <Bot className="h-5 w-5 text-brand-primary" />
                        </div>
                    )}
                    <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm text-gray-100 truncate">{nodeData.label}</p>
                        {nodeData.model && (
                            <p className="text-[11px] text-gray-500 truncate flex items-center gap-1">
                                <Cpu className="h-3 w-3" />
                                {nodeData.model}
                            </p>
                        )}
                    </div>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="rounded p-1 text-gray-600 hover:text-gray-300 hover:bg-white/5 transition-colors"
                >
                    <X className="h-3.5 w-3.5" />
                </button>
            </div>

            {/* Role + Execution Status */}
            <div className="flex items-center gap-1.5 mb-3">
                {nodeData.role && nodeData.role !== 'default' && (
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide ${
                        nodeData.role === 'brain' || nodeData.role === 'orchestrator'
                            ? 'bg-purple-500/15 text-purple-400'
                            : nodeData.role === 'reviewer'
                                ? 'bg-amber-500/15 text-amber-400'
                                : 'bg-blue-500/15 text-blue-400'
                    }`}>
                        {nodeData.role === 'orchestrator' ? 'Brain' : nodeData.role}
                    </span>
                )}
                {execState !== 'idle' && (
                    <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium ${execConfig.className} bg-white/5`}>
                        <execConfig.Icon className={`h-2.5 w-2.5 ${execState === 'running' ? 'animate-spin' : ''}`} />
                        {execConfig.label}
                    </span>
                )}
            </div>

            {/* Agent details */}
            {agent && (
                <div className="space-y-2 mb-3">
                    {agent.description && (
                        <p className="text-[11px] text-gray-400 leading-relaxed line-clamp-3">
                            {agent.description}
                        </p>
                    )}

                    {agent.tools.length > 0 && (
                        <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                            <Wrench className="h-3 w-3 shrink-0" />
                            <span>{agent.tools.length} tool{agent.tools.length !== 1 ? 's' : ''}</span>
                        </div>
                    )}

                    {agent.temperature !== 0.7 && (
                        <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                            <span>Temperature: {agent.temperature}</span>
                        </div>
                    )}
                </div>
            )}

            {/* Pipeline step info */}
            {stepConfig && (
                <>
                    <hr className="border-white/5 mb-2" />
                    <div className="space-y-1.5 mb-3">
                        <p className="text-[10px] font-medium uppercase tracking-wider text-gray-600">Step Config</p>
                        {stepConfig.step_name && (
                            <div>
                                <p className="text-[10px] text-gray-600">Name</p>
                                <p className="text-[11px] text-gray-300">{stepConfig.step_name}</p>
                            </div>
                        )}
                        {stepConfig.instructions && (
                            <div>
                                <p className="text-[10px] text-gray-600">Instructions</p>
                                <p className="text-[11px] text-gray-400 line-clamp-3">{stepConfig.instructions}</p>
                            </div>
                        )}
                        <div className="flex items-center gap-3">
                            <span className="text-[10px] text-gray-600">
                                On failure: <span className="text-gray-400">{stepConfig.on_failure}</span>
                            </span>
                            <span className="text-[10px] text-gray-600">
                                Retries: <span className="text-gray-400">{stepConfig.max_retries}</span>
                            </span>
                        </div>
                    </div>
                </>
            )}

            {/* I/O Inspector */}
            {hasIO && (
                <>
                    <hr className="border-white/5 mb-2" />
                    <div className="space-y-1.5 mb-3">
                        <p className="text-[10px] font-medium uppercase tracking-wider text-gray-600">I/O Inspector</p>

                        {/* Input */}
                        {inputText && (
                            <div>
                                <button
                                    type="button"
                                    onClick={() => setShowInput(!showInput)}
                                    className="flex items-center gap-1 text-[10px] text-sky-400 hover:text-sky-300 transition-colors w-full"
                                >
                                    <ArrowDownToLine className="h-3 w-3" />
                                    <span className="font-medium">Input</span>
                                    {showInput
                                        ? <ChevronDown className="h-2.5 w-2.5 ml-auto" />
                                        : <ChevronRight className="h-2.5 w-2.5 ml-auto" />
                                    }
                                </button>
                                {showInput && (
                                    <pre className="mt-1 rounded-md bg-black/30 border border-white/5 p-2 text-[10px] text-gray-400 leading-relaxed max-h-32 overflow-y-auto whitespace-pre-wrap break-words">
                                        {inputText}
                                    </pre>
                                )}
                            </div>
                        )}

                        {/* Output */}
                        {outputText && (
                            <div>
                                <button
                                    type="button"
                                    onClick={() => setShowOutput(!showOutput)}
                                    className="flex items-center gap-1 text-[10px] text-emerald-400 hover:text-emerald-300 transition-colors w-full"
                                >
                                    <ArrowUpFromLine className="h-3 w-3" />
                                    <span className="font-medium">Output</span>
                                    {showOutput
                                        ? <ChevronDown className="h-2.5 w-2.5 ml-auto" />
                                        : <ChevronRight className="h-2.5 w-2.5 ml-auto" />
                                    }
                                </button>
                                {showOutput && (
                                    <pre className="mt-1 rounded-md bg-black/30 border border-white/5 p-2 text-[10px] text-gray-300 leading-relaxed max-h-32 overflow-y-auto whitespace-pre-wrap break-words">
                                        {outputText}
                                    </pre>
                                )}
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* Brain protection notice */}
            {isBrain && team.mode === 'orchestrator' && (
                <div className="flex items-start gap-1.5 rounded-md bg-amber-500/5 border border-amber-500/15 px-2.5 py-2 mb-3">
                    <AlertTriangle className="h-3 w-3 text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-[10px] text-amber-400 leading-relaxed">
                        Brain agent cannot be removed from the orchestrator.
                    </p>
                </div>
            )}

            {/* Conditional node config */}
            {node.type === 'conditionalNode' && (
                <>
                    {/* Header override for conditional */}
                    <hr className="border-white/5 mb-2" />
                    <div className="space-y-1.5 mb-3">
                        <p className="text-[10px] font-medium uppercase tracking-wider text-gray-600">Condition Config</p>
                        {(node.data as unknown as ConditionalNodeData).conditions.map((c, i) => {
                            const opLabel: Record<ConditionOperator, string> = {
                                contains: 'contains', not_contains: 'not contains',
                                equals: '==', not_equals: '!=',
                                starts_with: 'starts with', ends_with: 'ends with',
                                regex: 'regex', gt: '>', lt: '<',
                                is_empty: 'is empty', is_not_empty: 'is not empty',
                                llm_judge: 'LLM judge',
                            }
                            return (
                                <div key={i} className="rounded-md bg-amber-500/5 border border-amber-500/10 px-2.5 py-2">
                                    <div className="flex items-center gap-1 text-[10px]">
                                        <span className="text-amber-400 font-mono">{c.field}</span>
                                        <span className="text-gray-600">{opLabel[c.operator]}</span>
                                        {c.value && <span className="text-gray-400 font-mono">"{c.value}"</span>}
                                    </div>
                                </div>
                            )
                        })}
                        <p className="text-[10px] text-gray-600 italic">
                            Condition editing coming soon — configure via API.
                        </p>
                    </div>
                </>
            )}

            {/* HTTP node config */}
            {node.type === 'httpNode' && (
                <>
                    <hr className="border-white/5 mb-2" />
                    <div className="space-y-1.5 mb-3">
                        <p className="text-[10px] font-medium uppercase tracking-wider text-gray-600">HTTP Config</p>
                        {(() => {
                            const httpData = node.data as unknown as HttpNodeData
                            const methodColors: Record<string, string> = {
                                GET: 'text-green-400', POST: 'text-blue-400',
                                PUT: 'text-amber-400', DELETE: 'text-red-400',
                                PATCH: 'text-purple-400',
                            }
                            return (
                                <>
                                    <div className="rounded-md bg-cyan-500/5 border border-cyan-500/10 px-2.5 py-2">
                                        <div className="flex items-center gap-1.5 text-[10px]">
                                            <span className={`font-bold ${methodColors[httpData.method] ?? 'text-gray-400'}`}>
                                                {httpData.method}
                                            </span>
                                            <span className="text-gray-400 font-mono truncate">
                                                {httpData.url || 'No URL set'}
                                            </span>
                                        </div>
                                    </div>
                                    {httpData.headers.length > 0 && (
                                        <div>
                                            <p className="text-[10px] text-gray-600">Headers ({httpData.headers.length})</p>
                                            {httpData.headers.slice(0, 3).map((h, i) => (
                                                <p key={i} className="text-[10px] text-gray-500 font-mono">
                                                    {h.key}: {h.value}
                                                </p>
                                            ))}
                                            {httpData.headers.length > 3 && (
                                                <p className="text-[10px] text-gray-600">+{httpData.headers.length - 3} more</p>
                                            )}
                                        </div>
                                    )}
                                    <div className="flex items-center gap-3">
                                        <span className="text-[10px] text-gray-600">
                                            Timeout: <span className="text-gray-400">{httpData.timeout || 30}s</span>
                                        </span>
                                    </div>
                                    <p className="text-[10px] text-gray-600 italic">
                                        HTTP editing coming soon — configure via API.
                                    </p>
                                </>
                            )
                        })()}
                    </div>
                </>
            )}

            {/* Actions */}
            <hr className="border-white/5 mb-2" />
            <div className="flex items-center gap-1.5">
                {agent && (
                    <a
                        href={`/agents/${agent.id}`}
                        className="flex items-center gap-1 rounded-md px-2 py-1.5 text-[11px] text-gray-400 hover:text-gray-200 hover:bg-white/5 transition-colors"
                    >
                        <ExternalLink className="h-3 w-3" />
                        Edit Agent
                    </a>
                )}
                {canDelete && onDelete && (
                    <button
                        type="button"
                        onClick={() => { onDelete(node.id); onClose() }}
                        className="flex items-center gap-1 rounded-md px-2 py-1.5 text-[11px] text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors ml-auto"
                    >
                        <Trash2 className="h-3 w-3" />
                        Remove
                    </button>
                )}
            </div>
        </div>
    )
}

/**
 * Extract input/output text for a specific agent from team messages.
 * Input = messages received by this agent (receiver_agent_id).
 * Output = messages sent by this agent (sender_agent_id).
 */
function getNodeIO(
    agentId: string | undefined,
    messages?: TeamMessage[],
): { inputText: string; outputText: string } {
    if (!agentId || !messages || messages.length === 0) {
        return { inputText: '', outputText: '' }
    }

    const inputMsgs = messages.filter(
        (m) => m.receiver_agent_id === agentId && m.content,
    )
    const outputMsgs = messages.filter(
        (m) => m.sender_agent_id === agentId && m.content && m.message_type !== 'delegation',
    )

    // Use the last input/output message (most recent)
    const inputText = inputMsgs.length > 0
        ? inputMsgs[inputMsgs.length - 1].content
        : ''
    const outputText = outputMsgs.length > 0
        ? outputMsgs[outputMsgs.length - 1].content
        : ''

    return { inputText, outputText }
}

