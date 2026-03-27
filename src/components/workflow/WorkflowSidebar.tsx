// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

/**
 * Sidebar for the workflow canvas.
 * Shows agent palette and properties of the selected node.
 */

import type { Node } from '@xyflow/react'
import type { Agent, Team, PipelineConfig, PipelineStep } from '@/types'
import type { AgentNodeData } from './nodes/AgentNode'
import { Bot, Info, Layers } from 'lucide-react'

interface WorkflowSidebarProps {
    team: Team
    agents: Agent[]
    selectedNode: Node | null
}

export function WorkflowSidebar({ team, agents, selectedNode }: WorkflowSidebarProps) {
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

    return (
        <div className="w-64 shrink-0 border-l border-border bg-surface-elevated/50 overflow-y-auto">
            {isAgentNode && nodeData ? (
                /* ─── Node Properties ─── */
                <div className="p-4">
                    <div className="mb-4 flex items-center gap-2">
                        <Info className="h-3.5 w-3.5 text-brand-primary" />
                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                            Agent Properties
                        </span>
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

                        {/* Pipeline step details */}
                        {stepConfig && (
                            <>
                                <hr className="border-border" />
                                <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Step Config</div>

                                {stepConfig.step_name && (
                                    <div>
                                        <label className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Step Name</label>
                                        <div className="mt-0.5 text-sm text-gray-300">{stepConfig.step_name}</div>
                                    </div>
                                )}

                                {stepConfig.instructions && (
                                    <div>
                                        <label className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Instructions</label>
                                        <div className="mt-0.5 text-xs text-gray-400 leading-relaxed">{stepConfig.instructions}</div>
                                    </div>
                                )}

                                {stepConfig.expected_output && (
                                    <div>
                                        <label className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Expected Output</label>
                                        <div className="mt-0.5 text-xs text-gray-400 leading-relaxed">{stepConfig.expected_output}</div>
                                    </div>
                                )}

                                <div>
                                    <label className="text-[10px] font-medium uppercase tracking-wide text-gray-500">On Failure</label>
                                    <div className="mt-0.5 text-sm capitalize text-gray-300">{stepConfig.on_failure}</div>
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
                        Click an agent node on the canvas to view its properties. Use the form view to add or remove agents.
                    </p>

                    <div className="space-y-1.5">
                        {agents.map((agent) => (
                            <div
                                key={agent.id}
                                className="flex items-center gap-2.5 rounded-lg border border-border bg-surface-card p-2.5 transition-colors hover:border-brand-primary/30"
                            >
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
