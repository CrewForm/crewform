// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

/**
 * Sidebar for the workflow canvas.
 * Always shows the draggable agent palette with search/filter.
 * Agent properties are shown via the on-canvas detail popup (NodeDetailPopup).
 */

import { useState, type DragEvent } from 'react'
import type { Agent } from '@/types'
import { Bot, Layers, GripVertical, Search, X } from 'lucide-react'

interface WorkflowSidebarProps {
    agents: Agent[]
    draggable?: boolean
}

export function WorkflowSidebar({ agents, draggable }: WorkflowSidebarProps) {
    const [searchQuery, setSearchQuery] = useState('')

    // ─── Drag handlers for sidebar palette ────────────────────────────────────

    function handleDragStart(event: DragEvent, agentId: string) {
        event.dataTransfer.setData('application/crewform-agent', agentId)
        event.dataTransfer.effectAllowed = 'move'
    }

    // ─── Filter agents ────────────────────────────────────────────────────────

    const filteredAgents = searchQuery.trim()
        ? agents.filter((agent) => {
            const q = searchQuery.toLowerCase()
            return (
                agent.name.toLowerCase().includes(q) ||
                agent.model.toLowerCase().includes(q)
            )
        })
        : agents

    return (
        <div className="w-64 shrink-0 border-l border-border bg-surface-elevated/50 overflow-y-auto">
            {/* Agent Palette */}
            <div className="p-4">
                <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Layers className="h-3.5 w-3.5 text-brand-primary" />
                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                            Agents
                        </span>
                    </div>
                    <span className="text-[10px] text-gray-600 tabular-nums">
                        {filteredAgents.length}/{agents.length}
                    </span>
                </div>

                {/* Search input */}
                {agents.length > 5 && (
                    <div className="relative mb-3">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-600" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Filter agents…"
                            className="w-full rounded-lg border border-border bg-surface-card pl-7 pr-7 py-1.5 text-xs text-gray-300 placeholder:text-gray-600 focus:outline-none focus:border-brand-primary/40"
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        )}
                    </div>
                )}

                <p className="mb-3 text-[11px] text-gray-500 leading-relaxed">
                    {draggable
                        ? 'Drag an agent onto the canvas to add it to the team. Click a node to inspect.'
                        : 'Click an agent node on the canvas to view its properties. Use the form view to add or remove agents.'
                    }
                </p>

                <div className="space-y-1.5">
                    {filteredAgents.map((agent) => (
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

                    {filteredAgents.length === 0 && searchQuery && (
                        <p className="text-center text-xs text-gray-600 py-4">
                            No agents matching &ldquo;{searchQuery}&rdquo;
                        </p>
                    )}

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
