// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

/**
 * Auto-layout hook using dagre for the workflow canvas.
 *
 * Arranges nodes in a directed graph layout:
 * - Pipeline: top-to-bottom (TB)
 * - Orchestrator: top-to-bottom with wider spread
 * - Collaboration: left-to-right (LR)
 */

import { useCallback } from 'react'
import Dagre from '@dagrejs/dagre'
import type { Node, Edge } from '@xyflow/react'

interface AutoLayoutOptions {
    direction?: 'TB' | 'LR'
    nodeWidth?: number
    nodeHeight?: number
    rankSep?: number
    nodeSep?: number
}

interface DagreNodePosition {
    x: number
    y: number
}

const DEFAULTS: Required<AutoLayoutOptions> = {
    direction: 'TB',
    nodeWidth: 220,
    nodeHeight: 80,
    rankSep: 80,
    nodeSep: 60,
}

export function useAutoLayout() {
    const applyAutoLayout = useCallback(
        (nodes: Node[], edges: Edge[], options?: AutoLayoutOptions): Node[] => {
            const opts = { ...DEFAULTS, ...options }

            const g = new Dagre.graphlib.Graph()
            g.setDefaultEdgeLabel(() => ({}))
            g.setGraph({
                rankdir: opts.direction,
                ranksep: opts.rankSep,
                nodesep: opts.nodeSep,
            })

            // Add nodes
            for (const node of nodes) {
                g.setNode(node.id, {
                    width: opts.nodeWidth,
                    height: opts.nodeHeight,
                })
            }

            // Add edges
            for (const edge of edges) {
                g.setEdge(edge.source, edge.target)
            }

            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
            Dagre.layout(g)

            // Map positions back
            return nodes.map((node) => {
                const pos = g.node(node.id) as unknown as DagreNodePosition
                return {
                    ...node,
                    position: {
                        x: pos.x - opts.nodeWidth / 2,
                        y: pos.y - opts.nodeHeight / 2,
                    },
                }
            })
        },
        [],
    )

    return { applyAutoLayout }
}

