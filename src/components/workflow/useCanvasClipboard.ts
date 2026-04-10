// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

/**
 * Canvas clipboard: Ctrl+C copies selected nodes, Ctrl+V pastes with offset.
 * Uses an in-memory ref (not system clipboard) since React Flow nodes
 * contain non-serializable data.
 */

import { useCallback, useRef } from 'react'
import type { Node, Edge } from '@xyflow/react'
import type { AgentNodeData } from './nodes/AgentNode'

interface ClipboardEntry {
    nodes: Node[]
    edges: Edge[]
}

interface UseCanvasClipboardOptions {
    nodes: Node[]
    edges: Edge[]
    setNodes: React.Dispatch<React.SetStateAction<Node[]>>
    setEdges: React.Dispatch<React.SetStateAction<Edge[]>>
    saveGraph: (nodes: Node[], edges: Edge[]) => Promise<void>
    pushState: (nodes: Node[], edges: Edge[]) => void
    teamMode: string
    layoutDirection: 'TB' | 'LR'
}

const PASTE_OFFSET = 40

export function useCanvasClipboard({
    nodes,
    edges,
    setNodes,
    setEdges,
    saveGraph,
    pushState,
    teamMode,
    layoutDirection,
}: UseCanvasClipboardOptions) {
    const clipboardRef = useRef<ClipboardEntry | null>(null)

    /** Copy currently selected nodes */
    const copy = useCallback(() => {
        const selected = nodes.filter((n) => n.selected && n.type === 'agentNode')
        if (selected.length === 0) return

        const selectedIds = new Set(selected.map((n) => n.id))
        const relatedEdges = edges.filter(
            (e) => selectedIds.has(e.source) && selectedIds.has(e.target),
        )

        clipboardRef.current = { nodes: selected, edges: relatedEdges }
    }, [nodes, edges])

    /** Paste clipboard contents with offset positions */
    const paste = useCallback(() => {
        const clipboard = clipboardRef.current
        if (!clipboard || clipboard.nodes.length === 0) return

        const timestamp = Date.now()
        const idMap = new Map<string, string>()

        // Create new nodes with remapped IDs
        const newNodes: Node[] = clipboard.nodes.map((original, idx) => {
            const newId = `agent-paste-${timestamp}-${idx}`
            idMap.set(original.id, newId)

            const data = original.data as unknown as AgentNodeData & { agentId?: string }

            return {
                ...original,
                id: newId,
                selected: true,
                position: {
                    x: original.position.x + PASTE_OFFSET,
                    y: original.position.y + PASTE_OFFSET,
                },
                data: {
                    ...data,
                    label: data.label,
                    model: data.model,
                    role: data.role ?? 'worker',
                    avatarUrl: data.avatarUrl ?? null,
                    agentId: data.agentId,
                },
            }
        })

        // Remap edges between pasted nodes
        const newEdges: Edge[] = clipboard.edges.map((original) => ({
            ...original,
            id: `e-paste-${timestamp}-${original.id}`,
            source: idMap.get(original.source) ?? original.source,
            target: idMap.get(original.target) ?? original.target,
        }))

        // Auto-connect pasted nodes based on team mode
        const modeEdges = createModeEdges(newNodes, nodes, teamMode, layoutDirection, timestamp)

        setNodes((currentNodes) => {
            setEdges((currentEdges) => {
                pushState(currentNodes, currentEdges)
                // Deselect existing nodes
                const deselected = currentNodes.map((n) => ({ ...n, selected: false }))
                const allNodes = [...deselected, ...newNodes]
                const allEdges = [...currentEdges, ...newEdges, ...modeEdges]
                setNodes(allNodes)
                void saveGraph(allNodes, allEdges)
                return allEdges
            })
            return currentNodes
        })
    }, [nodes, setNodes, setEdges, saveGraph, pushState, teamMode, layoutDirection])

    return { copy, paste, hasClipboard: () => clipboardRef.current !== null }
}

/** Create auto-connection edges for pasted nodes based on team mode */
function createModeEdges(
    newNodes: Node[],
    existingNodes: Node[],
    teamMode: string,
    _layoutDirection: 'TB' | 'LR',
    timestamp: number,
): Edge[] {
    const edges: Edge[] = []

    if (teamMode === 'orchestrator') {
        // Connect pasted workers to brain
        const brainNode = existingNodes.find(
            (n) => n.type === 'agentNode' && ((n.data as unknown as AgentNodeData).role === 'brain' || (n.data as unknown as AgentNodeData).role === 'orchestrator'),
        )
        if (brainNode) {
            for (const node of newNodes) {
                edges.push({
                    id: `e-paste-brain-${timestamp}-${node.id}`,
                    source: brainNode.id,
                    target: node.id,
                    animated: true,
                    style: { stroke: '#a78bfa', strokeWidth: 1.5, strokeDasharray: '6 3' },
                    label: 'delegates',
                    labelStyle: { fill: '#6b7280', fontSize: 10 },
                })
            }
        }
    } else if (teamMode === 'collaboration') {
        // Connect pasted agents to all existing agent nodes
        const existingAgents = existingNodes.filter((n) => n.type === 'agentNode')
        for (const newNode of newNodes) {
            for (const existing of existingAgents) {
                edges.push({
                    id: `e-paste-collab-${timestamp}-${existing.id}-${newNode.id}`,
                    source: existing.id,
                    target: newNode.id,
                    style: { stroke: '#f59e0b', strokeWidth: 1, strokeDasharray: '4 4' },
                })
            }
        }
    }
    // Pipeline: user manually connects pasted nodes

    return edges
}
