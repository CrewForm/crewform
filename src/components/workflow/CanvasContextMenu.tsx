// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

/**
 * Right-click context menu for the workflow canvas.
 *
 * Different menu items appear depending on what was right-clicked:
 * - Agent node: Delete, Duplicate (future), Set as Brain, Go to Agent
 * - Start/End node: Reset position, Auto-layout
 * - Canvas pane: Fit View, Auto-layout
 *
 * Uses glassmorphism styling matching the detail popup.
 */

import { useEffect, useRef, useState } from 'react'
import {
    Trash2,
    ExternalLink,
    Maximize2,
    LayoutGrid,
    Brain,
    Plus,
    Bot,
    StickyNote,
} from 'lucide-react'
import type { Node } from '@xyflow/react'
import type { AgentNodeData } from './nodes/AgentNode'
import type { Agent } from '@/types'

export interface ContextMenuState {
    x: number
    y: number
    nodeId: string | null
    /** Edge right-click context data (pipeline step insertion) */
    edgeId?: string | null
    edgeSource?: string
    edgeTarget?: string
}

interface CanvasContextMenuProps {
    state: ContextMenuState
    nodes: Node[]
    teamMode: string
    onClose: () => void
    onDeleteNode: (nodeId: string) => void
    onFitView: () => void
    onAutoLayout: () => void
    onGoToAgent?: (agentId: string) => void
    onSetAsBrain?: (nodeId: string) => void
    /** For edge context menu: insert agent between two nodes */
    agents?: Agent[]
    onInsertAgent?: (sourceId: string, targetId: string, agent: Agent) => void
    /** Add a sticky note at the given canvas position */
    onAddNote?: (x: number, y: number) => void
}

interface MenuItem {
    label: string
    icon: typeof Trash2
    onClick: () => void
    shortcut?: string
    disabled?: boolean
    danger?: boolean
}

export function CanvasContextMenu({
    state,
    nodes,
    teamMode,
    onClose,
    onDeleteNode,
    onFitView,
    onAutoLayout,
    onGoToAgent,
    onSetAsBrain,
    agents,
    onInsertAgent,
    onAddNote,
}: CanvasContextMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null)
    const [showAgentPicker, setShowAgentPicker] = useState(false)

    // Close on outside click
    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(e.target as HTMLElement)) {
                onClose()
            }
        }
        function handleEscape(e: KeyboardEvent) {
            if (e.key === 'Escape') onClose()
        }
        // Use a timeout to avoid the same click that opened the menu from closing it
        const timer = setTimeout(() => {
            document.addEventListener('mousedown', handleClick)
            document.addEventListener('keydown', handleEscape)
        }, 50)
        return () => {
            clearTimeout(timer)
            document.removeEventListener('mousedown', handleClick)
            document.removeEventListener('keydown', handleEscape)
        }
    }, [onClose])

    // Build menu items based on what was right-clicked
    const items: (MenuItem | 'separator')[] = []
    const node = state.nodeId ? nodes.find((n) => n.id === state.nodeId) : null

    if (node && node.type === 'agentNode') {
        // Agent node context menu
        const nodeData = node.data as unknown as AgentNodeData
        const agentId = (node.data as { agentId?: string }).agentId
        const isBrain = nodeData.role === 'brain' || nodeData.role === 'orchestrator'
        const protectedIds = new Set(['start', 'end', 'brain'])
        const canDelete = !protectedIds.has(node.id) && !(isBrain && teamMode === 'orchestrator')

        if (agentId && onGoToAgent) {
            items.push({
                label: 'Edit Agent',
                icon: ExternalLink,
                onClick: () => { onGoToAgent(agentId); onClose() },
            })
        }

        if (teamMode === 'orchestrator' && !isBrain && onSetAsBrain) {
            items.push({
                label: 'Set as Brain',
                icon: Brain,
                onClick: () => { onSetAsBrain(node.id); onClose() },
            })
        }

        items.push('separator')

        items.push({
            label: 'Auto Layout',
            icon: LayoutGrid,
            onClick: () => { onAutoLayout(); onClose() },
            shortcut: '',
        })

        items.push({
            label: 'Fit View',
            icon: Maximize2,
            onClick: () => { onFitView(); onClose() },
        })

        items.push('separator')

        items.push({
            label: 'Remove from Team',
            icon: Trash2,
            onClick: () => { onDeleteNode(node.id); onClose() },
            shortcut: '⌫',
            disabled: !canDelete,
            danger: true,
        })
    } else if (node && (node.type === 'startNode' || node.type === 'endNode')) {
        // Start/End node context menu
        items.push({
            label: 'Auto Layout',
            icon: LayoutGrid,
            onClick: () => { onAutoLayout(); onClose() },
        })
        items.push({
            label: 'Fit View',
            icon: Maximize2,
            onClick: () => { onFitView(); onClose() },
        })
    } else if (!node && state.edgeId && state.edgeSource && state.edgeTarget && onInsertAgent && agents) {
        // Edge context menu (pipeline step insertion)
        items.push({
            label: 'Insert Agent Here',
            icon: Plus,
            onClick: () => { setShowAgentPicker(true) },
        })
        items.push('separator')
        items.push({
            label: 'Fit View',
            icon: Maximize2,
            onClick: () => { onFitView(); onClose() },
        })
    } else {
        // Pane (canvas background) context menu
        if (onAddNote) {
            items.push({
                label: 'Add Note',
                icon: StickyNote,
                onClick: () => { onAddNote(state.x, state.y); onClose() },
            })
            items.push('separator')
        }
        items.push({
            label: 'Fit View',
            icon: Maximize2,
            onClick: () => { onFitView(); onClose() },
        })
        items.push({
            label: 'Auto Layout',
            icon: LayoutGrid,
            onClick: () => { onAutoLayout(); onClose() },
        })
    }

    // Clamp position to viewport
    const menuWidth = 200
    const menuHeight = items.length * 36
    const x = Math.min(state.x, window.innerWidth - menuWidth - 16)
    const y = Math.min(state.y, window.innerHeight - menuHeight - 16)

    return (
        <div
            ref={menuRef}
            className="workflow-context-menu workflow-popup-enter fixed z-50 rounded-xl py-1.5 min-w-[180px]"
            style={{ left: x, top: y }}
        >
            {items.map((item, idx) => {
                if (item === 'separator') {
                    return <hr key={`sep-${idx}`} className="my-1 border-white/5" />
                }

                const Icon = item.icon
                return (
                    <button
                        key={item.label}
                        type="button"
                        onClick={item.onClick}
                        disabled={item.disabled}
                        className={`workflow-context-menu-item flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12px] ${
                            item.danger
                                ? 'text-red-400 hover:!bg-red-500/10'
                                : 'text-gray-300'
                        }`}
                    >
                        <Icon className={`h-3.5 w-3.5 ${item.danger ? 'text-red-400' : 'text-gray-500'}`} />
                        <span className="flex-1">{item.label}</span>
                        {item.shortcut && (
                            <span className="text-[10px] text-gray-600 font-mono">{item.shortcut}</span>
                        )}
                    </button>
                )
            })}

            {/* Inline agent picker for edge insertion */}
            {showAgentPicker && agents && state.edgeSource && state.edgeTarget && onInsertAgent && (
                <>
                    <hr className="my-1 border-white/5" />
                    <div className="px-2 py-1">
                        <div className="text-[10px] text-gray-500 uppercase tracking-wide px-1 mb-1">Select Agent</div>
                        <div className="max-h-[200px] overflow-y-auto">
                            {agents.map((agent) => (
                                <button
                                    key={agent.id}
                                    type="button"
                                    onClick={() => {
                                        if (state.edgeSource && state.edgeTarget) {
                                            onInsertAgent(state.edgeSource, state.edgeTarget, agent)
                                        }
                                        onClose()
                                    }}
                                    className="workflow-context-menu-item flex w-full items-center gap-2 px-2 py-1.5 text-left text-[11px] text-gray-300 rounded"
                                >
                                    <Bot className="h-3 w-3 text-brand-primary shrink-0" />
                                    <span className="truncate flex-1">{agent.name}</span>
                                    <span className="text-[9px] text-gray-600 shrink-0">{agent.model}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}
