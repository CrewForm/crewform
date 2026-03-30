// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

/**
 * Sidebar for the workflow canvas.
 * Phase 3: Always shows the draggable agent palette.
 * Agent properties are now shown via the on-canvas detail popup (NodeDetailPopup).
 */

import type { DragEvent } from 'react'
import type { Agent } from '@/types'
import { Bot, Layers, GripVertical } from 'lucide-react'

interface WorkflowSidebarProps {
    agents: Agent[]
    draggable?: boolean
}

export function WorkflowSidebar({ agents, draggable }: WorkflowSidebarProps) {
    // ─── Drag handlers for sidebar palette ────────────────────────────────────

    function handleDragStart(event: DragEvent, agentId: string) {
        event.dataTransfer.setData('application/crewform-agent', agentId)
        event.dataTransfer.effectAllowed = 'move'
    }

    return (
        <div className="w-64 shrink-0 border-l border-border bg-surface-elevated/50 overflow-y-auto">
            {/* Agent Palette */}
            <div className="p-4">
                <div className="mb-4 flex items-center gap-2">
                    <Layers className="h-3.5 w-3.5 text-brand-primary" />
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                        Agents
                    </span>
                </div>

                <p className="mb-3 text-[11px] text-gray-500 leading-relaxed">
                    {draggable
                        ? 'Drag an agent onto the canvas to add it to the team. Click a node to inspect.'
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
        </div>
    )
}
