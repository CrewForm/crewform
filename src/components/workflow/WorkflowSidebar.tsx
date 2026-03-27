// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

/**
 * Sidebar for the workflow canvas.
 * Phase 2: Draggable agent palette + selected node properties + delete.
 */

import type { DragEvent } from 'react'
import type { Node } from '@xyflow/react'
import type { Agent, Team, PipelineConfig, PipelineStep } from '@/types'
import type { AgentNodeData } from './nodes/AgentNode'
import { Bot, Info, Layers, Trash2, GripVertical } from 'lucide-react'

interface WorkflowSidebarProps {
    team: Team
    agents: Agent[]
    selectedNode: Node | null
    onDeleteNode?: (nodeId: string) => void
    onStepUpdate?: (stepIndex: number, updates: Partial<PipelineStep>) => void
    draggable?: boolean
}

export function WorkflowSidebar({ team, agents, selectedNode, onDeleteNode, onStepUpdate, draggable }: WorkflowSidebarProps) {
    const isAgentNode = selectedNode?.type === 'agentNode'
    const nodeData = isAgentNode ? (selectedNode.data as unknown as AgentNodeData) : null

    // For pipeline mode, find the step config for the selected node
    const stepIndex = selectedNode?.id.startsWith('agent-')
        ? parseInt(selectedNode.id.replace('agent-', ''), 10)
        : -1
    const pipelineConfig = team.mode === 'pipeline' ? (team.config as PipelineConfig) : null
    const stepConfig: PipelineStep | null = pipelineConfig && stepIndex >= 0
        ? (pipelineConfig.steps[stepIndex] ?? null)
        : null

    // Can this node be deleted?
    const protectedIds = new Set(['start', 'end', 'brain'])
    const canDelete = selectedNode && !protectedIds.has(selectedNode.id) && isAgentNode

    // Is this the brain in orchestrator mode?
    const isBrain = nodeData?.role === 'brain' || nodeData?.role === 'orchestrator'

    // ─── Step editing helpers ─────────────────────────────────────────────────

    function handleStepFieldBlur(field: keyof PipelineStep, value: string) {
        if (stepIndex < 0 || !onStepUpdate) return
        onStepUpdate(stepIndex, { [field]: value })
    }

    // ─── Drag handlers for sidebar palette ────────────────────────────────────

    function handleDragStart(event: DragEvent, agentId: string) {
        event.dataTransfer.setData('application/crewform-agent', agentId)
        event.dataTransfer.effectAllowed = 'move'
    }

    return (
        <div className="w-64 shrink-0 border-l border-border bg-surface-elevated/50 overflow-y-auto">
            {isAgentNode && nodeData ? (
                /* ─── Node Properties ─── */
                <div className="p-4">
                    <div className="mb-4 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Info className="h-3.5 w-3.5 text-brand-primary" />
                            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                                Agent Properties
                            </span>
                        </div>
                        {canDelete && onDeleteNode && (
                            <button
                                type="button"
                                onClick={() => onDeleteNode(selectedNode.id)}
                                className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-red-400 transition-colors hover:bg-red-500/10"
                                title="Remove from team"
                            >
                                <Trash2 className="h-3 w-3" />
                                Remove
                            </button>
                        )}
                    </div>

                    <div className="space-y-3">
                        {/* Agent name */}
                        <div>
                            <label className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Name</label>
                            <div className="mt-0.5 text-sm font-medium text-gray-200">{nodeData.label}</div>
                        </div>

                        {/* Model */}
                        {nodeData.model && (
                            <div>
                                <label className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Model</label>
                                <div className="mt-0.5 text-sm text-gray-300">{nodeData.model}</div>
                            </div>
                        )}

                        {/* Role */}
                        {nodeData.role && nodeData.role !== 'default' && (
                            <div>
                                <label className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Role</label>
                                <div className="mt-0.5 text-sm capitalize text-gray-300">{nodeData.role}</div>
                            </div>
                        )}

                        {/* Brain protection notice */}
                        {isBrain && team.mode === 'orchestrator' && (
                            <div className="rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2">
                                <p className="text-[10px] text-amber-400">
                                    This is the brain agent. It cannot be removed from the orchestrator.
                                </p>
                            </div>
                        )}

                        {/* Pipeline step details — editable */}
                        {stepConfig && (
                            <>
                                <hr className="border-border" />
                                <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Step Config</div>

                                <div>
                                    <label className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Step Name</label>
                                    <input
                                        type="text"
                                        defaultValue={stepConfig.step_name}
                                        key={`${selectedNode.id}-step_name`}
                                        onBlur={(e) => handleStepFieldBlur('step_name', e.target.value)}
                                        className="mt-0.5 w-full rounded-md border border-border bg-surface-card px-2 py-1 text-sm text-gray-200 outline-none focus:border-brand-primary/50 transition-colors"
                                        placeholder="Step name"
                                    />
                                </div>

                                <div>
                                    <label className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Instructions</label>
                                    <textarea
                                        defaultValue={stepConfig.instructions}
                                        key={`${selectedNode.id}-instructions`}
                                        onBlur={(e) => handleStepFieldBlur('instructions', e.target.value)}
                                        rows={3}
                                        className="mt-0.5 w-full rounded-md border border-border bg-surface-card px-2 py-1 text-xs text-gray-300 leading-relaxed outline-none resize-y focus:border-brand-primary/50 transition-colors"
                                        placeholder="What should this agent do in this step?"
                                    />
                                </div>

                                <div>
                                    <label className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Expected Output</label>
                                    <textarea
                                        defaultValue={stepConfig.expected_output}
                                        key={`${selectedNode.id}-expected_output`}
                                        onBlur={(e) => handleStepFieldBlur('expected_output', e.target.value)}
                                        rows={2}
                                        className="mt-0.5 w-full rounded-md border border-border bg-surface-card px-2 py-1 text-xs text-gray-300 leading-relaxed outline-none resize-y focus:border-brand-primary/50 transition-colors"
                                        placeholder="What output is expected from this step?"
                                    />
                                </div>

                                <div>
                                    <label className="text-[10px] font-medium uppercase tracking-wide text-gray-500">On Failure</label>
                                    <select
                                        defaultValue={stepConfig.on_failure}
                                        key={`${selectedNode.id}-on_failure`}
                                        onChange={(e) => handleStepFieldBlur('on_failure', e.target.value)}
                                        className="mt-0.5 w-full rounded-md border border-border bg-surface-card px-2 py-1.5 text-sm text-gray-300 outline-none focus:border-brand-primary/50 transition-colors cursor-pointer"
                                    >
                                        <option value="stop">Stop</option>
                                        <option value="skip">Skip</option>
                                        <option value="retry">Retry</option>
                                    </select>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            ) : (
                /* ─── Agent Palette ─── */
                <div className="p-4">
                    <div className="mb-4 flex items-center gap-2">
                        <Layers className="h-3.5 w-3.5 text-brand-primary" />
                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                            Agents
                        </span>
                    </div>

                    <p className="mb-3 text-[11px] text-gray-500 leading-relaxed">
                        {draggable
                            ? 'Drag an agent onto the canvas to add it to the team, or click a node to view its properties.'
                            : 'Click an agent node on the canvas to view its properties. Use the form view to add or remove agents.'
                        }
                    </p>

                    <div className="space-y-1.5">
                        {agents.map((agent) => (
                            <div
                                key={agent.id}
                                draggable={draggable}
                                onDragStart={draggable ? (e) => handleDragStart(e, agent.id) : undefined}
                                className={`flex items-center gap-2.5 rounded-lg border border-border bg-surface-card p-2.5 transition-colors hover:border-brand-primary/30 ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
                            >
                                {draggable && (
                                    <GripVertical className="h-3.5 w-3.5 text-gray-600 shrink-0" />
                                )}
                                {agent.avatar_url ? (
                                    <img
                                        src={agent.avatar_url}
                                        alt={agent.name}
                                        className="h-7 w-7 rounded-md object-cover"
                                    />
                                ) : (
                                    <div className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-muted">
                                        <Bot className="h-3.5 w-3.5 text-brand-primary" />
                                    </div>
                                )}
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-xs font-medium text-gray-200">{agent.name}</div>
                                    <div className="truncate text-[10px] text-gray-500">{agent.model}</div>
                                </div>
                            </div>
                        ))}

                        {agents.length === 0 && (
                            <p className="text-center text-xs text-gray-600 py-4">
                                No agents in this workspace yet.
                            </p>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
