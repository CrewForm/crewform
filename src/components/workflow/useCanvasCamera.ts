// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

/**
 * Smooth camera follow hook.
 *
 * When enabled, automatically pans the canvas to keep the currently
 * executing agent node in view. Debounced to avoid frantic panning.
 *
 * Uses React Flow's fitView() with duration for smooth transitions.
 */

import { useEffect, useRef } from 'react'
import { useReactFlow } from '@xyflow/react'
import type { ExecutionNodeState } from './useExecutionState'

const DEBOUNCE_MS = 500
const ANIMATION_DURATION = 600

/**
 * Finds the node ID that is currently in the 'running' state.
 */
function findRunningNode(
    executionStates: Map<string, ExecutionNodeState> | null,
): string | null {
    if (!executionStates) return null

    for (const [nodeId, state] of executionStates) {
        if (state === 'running') return nodeId
    }
    return null
}

export function useCanvasCamera(
    executionStates: Map<string, ExecutionNodeState> | null,
    enabled: boolean,
) {
    const { fitView } = useReactFlow()
    const lastRunningNode = useRef<string | null>(null)
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        if (!enabled || !executionStates) {
            lastRunningNode.current = null
            return
        }

        const runningNodeId = findRunningNode(executionStates)

        // Only pan when the running node changes
        if (runningNodeId && runningNodeId !== lastRunningNode.current) {
            lastRunningNode.current = runningNodeId

            // Debounce to avoid rapid panning
            if (timerRef.current) {
                clearTimeout(timerRef.current)
            }

            timerRef.current = setTimeout(() => {
                void fitView({
                    nodes: [{ id: runningNodeId }],
                    duration: ANIMATION_DURATION,
                    padding: 0.5,
                    maxZoom: 1.5,
                })
            }, DEBOUNCE_MS)
        }

        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current)
            }
        }
    }, [executionStates, enabled, fitView])
}

/**
 * Pan to a specific node (used by timeline step clicks).
 */
export function usePanToNode() {
    const { fitView } = useReactFlow()

    return (nodeId: string) => {
        void fitView({
            nodes: [{ id: nodeId }],
            duration: ANIMATION_DURATION,
            padding: 0.4,
            maxZoom: 1.5,
        })
    }
}
