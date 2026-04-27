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
import type { HttpNodeData, HttpMethod } from './nodes/HttpNode'
import type { ExecutionNodeState } from './useExecutionState'

interface NodeDetailPopupProps {
    node: Node
    team: Team
    agents: Agent[]
    executionStates: Map<string, ExecutionNodeState> | null
    runMessages?: TeamMessage[]
    onDelete?: (nodeId: string) => void
    onUpdateNodeData?: (nodeId: string, newData: Record<string, unknown>) => void
    onClose: () => void
}

const EXEC_STATUS_CONFIG: Record<ExecutionNodeState, { label: string; className: string; Icon: typeof Check }> = {
    idle: { label: 'Idle', className: 'text-gray-500', Icon: Bot },
    running: { label: 'Running…', className: 'text-blue-400', Icon: Loader2 },
    completed: { label: 'Completed', className: 'text-green-400', Icon: Check },
    failed: { label: 'Failed', className: 'text-red-400', Icon: X },
}

export function NodeDetailPopup({ node, team, agents, executionStates, runMessages, onDelete, onUpdateNodeData, onClose }: NodeDetailPopupProps) {
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

            {/* Conditional node config — editable form */}
            {node.type === 'conditionalNode' && onUpdateNodeData && (() => {
                const condData = node.data as unknown as ConditionalNodeData
                const condition = condData.conditions[0] as ConditionalNodeData['conditions'][number] | undefined
                const opOptions: { value: ConditionOperator; label: string }[] = [
                    { value: 'contains', label: 'contains' },
                    { value: 'not_contains', label: 'not contains' },
                    { value: 'equals', label: '==' },
                    { value: 'not_equals', label: '!=' },
                    { value: 'starts_with', label: 'starts with' },
                    { value: 'ends_with', label: 'ends with' },
                    { value: 'regex', label: 'regex' },
                    { value: 'gt', label: '>' },
                    { value: 'lt', label: '<' },
                    { value: 'is_empty', label: 'is empty' },
                    { value: 'is_not_empty', label: 'is not empty' },
                    { value: 'llm_judge', label: 'LLM judge' },
                ]
                const hideValue = condition?.operator === 'is_empty' || condition?.operator === 'is_not_empty'
                const updateCondition = (patch: Partial<{ field: string; operator: ConditionOperator; value: string }>) => {
                    const updated = { ...(condition ?? { field: 'output', operator: 'contains' as ConditionOperator, value: '' }), ...patch }
                    onUpdateNodeData(node.id, { conditions: [updated] })
                }
                return (
                    <>
                        <hr className="border-white/5 mb-2" />
                        <div className="space-y-2 mb-3">
                            <p className="text-[10px] font-medium uppercase tracking-wider text-gray-600">Condition Config</p>
                            {/* Label */}
                            <div>
                                <label className="text-[9px] text-gray-600 uppercase tracking-wider">Label</label>
                                <input
                                    type="text"
                                    defaultValue={condData.label}
                                    onBlur={(e) => onUpdateNodeData(node.id, { label: e.target.value })}
                                    className="w-full mt-0.5 rounded-md bg-white/5 border border-white/10 px-2 py-1 text-[11px] text-gray-200 focus:border-amber-500/50 focus:outline-none transition-colors"
                                    placeholder="Condition name"
                                />
                            </div>
                            {/* Field */}
                            <div>
                                <label className="text-[9px] text-gray-600 uppercase tracking-wider">Field</label>
                                <input
                                    type="text"
                                    defaultValue={condition?.field ?? 'output'}
                                    onBlur={(e) => updateCondition({ field: e.target.value })}
                                    className="w-full mt-0.5 rounded-md bg-white/5 border border-white/10 px-2 py-1 text-[11px] text-amber-400 font-mono focus:border-amber-500/50 focus:outline-none transition-colors"
                                    placeholder="output"
                                />
                            </div>
                            {/* Operator */}
                            <div>
                                <label className="text-[9px] text-gray-600 uppercase tracking-wider">Operator</label>
                                <select
                                    value={condition?.operator ?? 'contains'}
                                    onChange={(e) => updateCondition({ operator: e.target.value as ConditionOperator })}
                                    className="w-full mt-0.5 rounded-md bg-white/5 border border-white/10 px-2 py-1 text-[11px] text-gray-200 focus:border-amber-500/50 focus:outline-none transition-colors appearance-none cursor-pointer"
                                >
                                    {opOptions.map((op) => (
                                        <option key={op.value} value={op.value} className="bg-gray-900">{op.label}</option>
                                    ))}
                                </select>
                            </div>
                            {/* Value (hidden for is_empty/is_not_empty) */}
                            {!hideValue && (
                                <div>
                                    <label className="text-[9px] text-gray-600 uppercase tracking-wider">
                                        {condition?.operator === 'llm_judge' ? 'Prompt' : 'Value'}
                                    </label>
                                    <input
                                        type="text"
                                        defaultValue={condition?.value ?? ''}
                                        onBlur={(e) => updateCondition({ value: e.target.value })}
                                        className="w-full mt-0.5 rounded-md bg-white/5 border border-white/10 px-2 py-1 text-[11px] text-gray-200 font-mono focus:border-amber-500/50 focus:outline-none transition-colors"
                                        placeholder={condition?.operator === 'llm_judge' ? 'Is this response positive?' : 'comparison value'}
                                    />
                                </div>
                            )}
                            <p className="text-[9px] text-gray-600 leading-relaxed">
                                Connect the <span className="text-green-400">True</span> and <span className="text-red-400">False</span> output handles to different agents to create branches.
                            </p>
                        </div>
                    </>
                )
            })()}

            {/* HTTP node config — editable form */}
            {node.type === 'httpNode' && onUpdateNodeData && (() => {
                const httpData = node.data as unknown as HttpNodeData
                const methods: HttpMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
                const methodColors: Record<string, string> = {
                    GET: 'text-green-400', POST: 'text-blue-400',
                    PUT: 'text-amber-400', DELETE: 'text-red-400',
                    PATCH: 'text-purple-400',
                }
                const showBody = httpData.method === 'POST' || httpData.method === 'PUT' || httpData.method === 'PATCH'
                return (
                    <>
                        <hr className="border-white/5 mb-2" />
                        <div className="space-y-2 mb-3">
                            <p className="text-[10px] font-medium uppercase tracking-wider text-gray-600">HTTP Config</p>
                            {/* Label */}
                            <div>
                                <label className="text-[9px] text-gray-600 uppercase tracking-wider">Label</label>
                                <input
                                    type="text"
                                    defaultValue={httpData.label}
                                    onBlur={(e) => onUpdateNodeData(node.id, { label: e.target.value })}
                                    className="w-full mt-0.5 rounded-md bg-white/5 border border-white/10 px-2 py-1 text-[11px] text-gray-200 focus:border-cyan-500/50 focus:outline-none transition-colors"
                                    placeholder="Request name"
                                />
                            </div>
                            {/* Method + URL inline */}
                            <div className="flex gap-1.5">
                                <div className="w-20 shrink-0">
                                    <label className="text-[9px] text-gray-600 uppercase tracking-wider">Method</label>
                                    <select
                                        value={httpData.method}
                                        onChange={(e) => onUpdateNodeData(node.id, { method: e.target.value })}
                                        className={`w-full mt-0.5 rounded-md bg-white/5 border border-white/10 px-1.5 py-1 text-[11px] font-bold focus:border-cyan-500/50 focus:outline-none transition-colors appearance-none cursor-pointer ${methodColors[httpData.method] ?? 'text-gray-400'}`}
                                    >
                                        {methods.map((m) => (
                                            <option key={m} value={m} className="bg-gray-900">{m}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <label className="text-[9px] text-gray-600 uppercase tracking-wider">URL</label>
                                    <input
                                        type="text"
                                        defaultValue={httpData.url}
                                        onBlur={(e) => onUpdateNodeData(node.id, { url: e.target.value })}
                                        className="w-full mt-0.5 rounded-md bg-white/5 border border-white/10 px-2 py-1 text-[11px] text-gray-200 font-mono focus:border-cyan-500/50 focus:outline-none transition-colors"
                                        placeholder="https://api.example.com/endpoint"
                                    />
                                </div>
                            </div>
                            {/* Headers */}
                            <div>
                                <div className="flex items-center justify-between">
                                    <label className="text-[9px] text-gray-600 uppercase tracking-wider">Headers</label>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const updated = [...httpData.headers, { key: '', value: '' }]
                                            onUpdateNodeData(node.id, { headers: updated })
                                        }}
                                        className="text-[9px] text-cyan-400 hover:text-cyan-300 transition-colors"
                                    >
                                        + Add
                                    </button>
                                </div>
                                {httpData.headers.map((h, i) => (
                                    <div key={i} className="flex gap-1 mt-1 items-center">
                                        <input
                                            type="text"
                                            defaultValue={h.key}
                                            onBlur={(e) => {
                                                const updated = [...httpData.headers]
                                                updated[i] = { ...updated[i], key: e.target.value }
                                                onUpdateNodeData(node.id, { headers: updated })
                                            }}
                                            className="w-1/3 rounded-md bg-white/5 border border-white/10 px-1.5 py-0.5 text-[10px] text-gray-300 font-mono focus:border-cyan-500/50 focus:outline-none"
                                            placeholder="Key"
                                        />
                                        <input
                                            type="text"
                                            defaultValue={h.value}
                                            onBlur={(e) => {
                                                const updated = [...httpData.headers]
                                                updated[i] = { ...updated[i], value: e.target.value }
                                                onUpdateNodeData(node.id, { headers: updated })
                                            }}
                                            className="flex-1 rounded-md bg-white/5 border border-white/10 px-1.5 py-0.5 text-[10px] text-gray-300 font-mono focus:border-cyan-500/50 focus:outline-none"
                                            placeholder="Value"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const updated = httpData.headers.filter((_, idx) => idx !== i)
                                                onUpdateNodeData(node.id, { headers: updated })
                                            }}
                                            className="text-red-400/60 hover:text-red-400 transition-colors shrink-0"
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                            {/* Body (POST/PUT/PATCH only) */}
                            {showBody && (
                                <div>
                                    <label className="text-[9px] text-gray-600 uppercase tracking-wider">Body</label>
                                    <textarea
                                        defaultValue={httpData.body}
                                        onBlur={(e) => onUpdateNodeData(node.id, { body: e.target.value })}
                                        className="w-full mt-0.5 rounded-md bg-white/5 border border-white/10 px-2 py-1 text-[10px] text-gray-200 font-mono focus:border-cyan-500/50 focus:outline-none transition-colors resize-none"
                                        rows={3}
                                        placeholder='{"key": "value"}'
                                    />
                                </div>
                            )}
                            {/* Timeout */}
                            <div>
                                <label className="text-[9px] text-gray-600 uppercase tracking-wider">Timeout (seconds)</label>
                                <input
                                    type="number"
                                    defaultValue={httpData.timeout || 30}
                                    min={1}
                                    max={300}
                                    onBlur={(e) => onUpdateNodeData(node.id, { timeout: parseInt(e.target.value, 10) || 30 })}
                                    className="w-20 mt-0.5 rounded-md bg-white/5 border border-white/10 px-2 py-1 text-[11px] text-gray-200 focus:border-cyan-500/50 focus:outline-none transition-colors"
                                />
                            </div>
                        </div>
                    </>
                )
            })()}

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

