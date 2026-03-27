// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

/**
 * Undo/redo history for the workflow canvas.
 *
 * Stores snapshots of { nodes, edges } state.
 * Max 30 entries. Supports Ctrl+Z / Ctrl+Shift+Z keyboard shortcuts.
 */

import { useCallback, useRef, useEffect, useState } from 'react'
import type { Node, Edge } from '@xyflow/react'

interface Snapshot {
    nodes: Node[]
    edges: Edge[]
}

const MAX_HISTORY = 30

export function useCanvasHistory(
    setNodes: (nodes: Node[]) => void,
    setEdges: (edges: Edge[]) => void,
) {
    const undoStack = useRef<Snapshot[]>([])
    const redoStack = useRef<Snapshot[]>([])
    const [canUndo, setCanUndo] = useState(false)
    const [canRedo, setCanRedo] = useState(false)

    const updateFlags = useCallback(() => {
        setCanUndo(undoStack.current.length > 0)
        setCanRedo(redoStack.current.length > 0)
    }, [])

    /** Save current state before a mutation */
    const pushState = useCallback((nodes: Node[], edges: Edge[]) => {
        undoStack.current.push({
            nodes: nodes.map((n) => ({ ...n, position: { ...n.position } })),
            edges: edges.map((e) => ({ ...e })),
        })
        // Cap history
        if (undoStack.current.length > MAX_HISTORY) {
            undoStack.current.shift()
        }
        // Clear redo on new action
        redoStack.current = []
        updateFlags()
    }, [updateFlags])

    /** Undo last action */
    const undo = useCallback((currentNodes: Node[], currentEdges: Edge[]) => {
        const snapshot = undoStack.current.pop()
        if (!snapshot) return

        // Push current state to redo
        redoStack.current.push({
            nodes: currentNodes.map((n) => ({ ...n, position: { ...n.position } })),
            edges: currentEdges.map((e) => ({ ...e })),
        })

        setNodes(snapshot.nodes)
        setEdges(snapshot.edges)
        updateFlags()
    }, [setNodes, setEdges, updateFlags])

    /** Redo last undone action */
    const redo = useCallback((currentNodes: Node[], currentEdges: Edge[]) => {
        const snapshot = redoStack.current.pop()
        if (!snapshot) return

        // Push current state to undo
        undoStack.current.push({
            nodes: currentNodes.map((n) => ({ ...n, position: { ...n.position } })),
            edges: currentEdges.map((e) => ({ ...e })),
        })

        setNodes(snapshot.nodes)
        setEdges(snapshot.edges)
        updateFlags()
    }, [setNodes, setEdges, updateFlags])

    /** Reset history (e.g. on external config change) */
    const resetHistory = useCallback(() => {
        undoStack.current = []
        redoStack.current = []
        updateFlags()
    }, [updateFlags])

    // Keyboard shortcuts
    useEffect(() => {
        // We need the latest nodes/edges when the shortcut fires,
        // so we read them from the DOM via a custom event approach.
        // The canvas component will dispatch these.
        const handleKeyDown = (e: KeyboardEvent) => {
            const isUndo = (e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === 'z'
            const isRedo = (e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'z'

            if (isUndo || isRedo) {
                e.preventDefault()
                // Dispatch custom event — canvas will handle with current state
                window.dispatchEvent(new CustomEvent(isUndo ? 'canvas:undo' : 'canvas:redo'))
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [])

    return { pushState, undo, redo, canUndo, canRedo, resetHistory }
}
