// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

/**
 * Hook that converts Team config ↔ React Flow node/edge graphs.
 *
 * Reads the existing PipelineConfig / OrchestratorConfig / CollaborationConfig
 * and generates a visual graph. Changes on the canvas write back to the same config.
 */

import { useMemo } from 'react'
import type { Node, Edge } from '@xyflow/react'
import type {
    Agent,
    Team,
    PipelineConfig,
    OrchestratorConfig,
    CollaborationConfig,
} from '@/types'
import type { AgentNodeData } from './nodes/AgentNode'

const Y_SPACING = 120
const X_CENTER = 300

function agentById(agents: Agent[], id: string): Agent | undefined {
    return agents.find((a) => a.id === id)
}

function makeAgentNodeData(agent: Agent | undefined, role?: string): AgentNodeData {
    return {
        label: agent?.name ?? 'Unknown Agent',
        model: agent?.model ?? undefined,
        role: role ?? 'default',
        avatarUrl: agent?.avatar_url ?? null,
    }
}

// ─── Pipeline → Graph ────────────────────────────────────────────────────────

function pipelineToGraph(config: PipelineConfig, agents: Agent[]): { nodes: Node[]; edges: Edge[] } {
    const nodes: Node[] = []
    const edges: Edge[] = []

    // Start node
    nodes.push({
        id: 'start',
        type: 'startNode',
        position: { x: X_CENTER, y: 0 },
        data: {},
        draggable: true,
    })

    // Agent nodes
    config.steps.forEach((step, idx) => {
        const agent = agentById(agents, step.agent_id)
        const nodeId = `agent-${idx}`
        nodes.push({
            id: nodeId,
            type: 'agentNode',
            position: { x: X_CENTER, y: (idx + 1) * Y_SPACING },
            data: makeAgentNodeData(agent, 'worker'),
            draggable: true,
        })

        // Edge from previous
        const sourceId = idx === 0 ? 'start' : `agent-${idx - 1}`
        edges.push({
            id: `e-${sourceId}-${nodeId}`,
            source: sourceId,
            target: nodeId,
            animated: true,
            style: { stroke: '#6bedb9', strokeWidth: 2 },
        })
    })

    // End node
    const endY = (config.steps.length + 1) * Y_SPACING
    nodes.push({
        id: 'end',
        type: 'endNode',
        position: { x: X_CENTER, y: endY },
        data: {},
        draggable: true,
    })

    if (config.steps.length > 0) {
        const lastAgentId = `agent-${config.steps.length - 1}`
        edges.push({
            id: `e-${lastAgentId}-end`,
            source: lastAgentId,
            target: 'end',
            animated: true,
            style: { stroke: '#6bedb9', strokeWidth: 2 },
        })
    } else {
        edges.push({
            id: 'e-start-end',
            source: 'start',
            target: 'end',
            animated: true,
            style: { stroke: '#6bedb9', strokeWidth: 2 },
        })
    }

    return { nodes, edges }
}

// ─── Orchestrator → Graph ────────────────────────────────────────────────────

function orchestratorToGraph(config: OrchestratorConfig, agents: Agent[]): { nodes: Node[]; edges: Edge[] } {
    const nodes: Node[] = []
    const edges: Edge[] = []

    // Start node
    nodes.push({
        id: 'start',
        type: 'startNode',
        position: { x: X_CENTER, y: 0 },
        data: {},
        draggable: true,
    })

    // Brain agent (center)
    const brainAgent = agentById(agents, config.brain_agent_id)
    nodes.push({
        id: 'brain',
        type: 'agentNode',
        position: { x: X_CENTER, y: Y_SPACING },
        data: makeAgentNodeData(brainAgent, 'brain'),
        draggable: true,
    })

    edges.push({
        id: 'e-start-brain',
        source: 'start',
        target: 'brain',
        animated: true,
        style: { stroke: '#a78bfa', strokeWidth: 2 },
    })

    // Worker agents (radial)
    const workerIds = config.worker_agent_ids ?? []
    const workerCount = workerIds.length
    const spreadWidth = Math.max(workerCount * 220, 400)
    const startX = X_CENTER - spreadWidth / 2 + 110

    workerIds.forEach((agentId, idx) => {
        const agent = agentById(agents, agentId)
        const nodeId = `worker-${idx}`
        const x = workerCount === 1 ? X_CENTER : startX + idx * (spreadWidth / Math.max(workerCount - 1, 1))

        nodes.push({
            id: nodeId,
            type: 'agentNode',
            position: { x, y: Y_SPACING * 2.5 },
            data: makeAgentNodeData(agent, 'worker'),
            draggable: true,
        })

        edges.push({
            id: `e-brain-${nodeId}`,
            source: 'brain',
            target: nodeId,
            animated: true,
            style: { stroke: '#a78bfa', strokeWidth: 1.5, strokeDasharray: '6 3' },
            label: 'delegates',
            labelStyle: { fill: '#6b7280', fontSize: 10 },
        })
    })

    // End node
    const endY = Y_SPACING * 4
    nodes.push({
        id: 'end',
        type: 'endNode',
        position: { x: X_CENTER, y: endY },
        data: {},
        draggable: true,
    })

    edges.push({
        id: 'e-brain-end',
        source: 'brain',
        target: 'end',
        animated: true,
        style: { stroke: '#a78bfa', strokeWidth: 2 },
    })

    return { nodes, edges }
}

// ─── Collaboration → Graph ───────────────────────────────────────────────────

function collaborationToGraph(config: CollaborationConfig, agents: Agent[]): { nodes: Node[]; edges: Edge[] } {
    const nodes: Node[] = []
    const edges: Edge[] = []

    const agentIds = config.agent_ids
    const count = agentIds.length
    const radius = Math.max(count * 50, 120)

    // Arrange agents in a circle
    agentIds.forEach((agentId, idx) => {
        const agent = agentById(agents, agentId)
        const angle = (2 * Math.PI * idx) / Math.max(count, 1) - Math.PI / 2
        const x = X_CENTER + radius * Math.cos(angle)
        const y = Y_SPACING * 1.5 + radius * Math.sin(angle)

        const isFacilitator = config.facilitator_agent_id === agentId
        nodes.push({
            id: `collab-${idx}`,
            type: 'agentNode',
            position: { x, y },
            data: makeAgentNodeData(agent, isFacilitator ? 'brain' : 'worker'),
            draggable: true,
        })
    })

    // Bidirectional dotted edges between all pairs
    for (let i = 0; i < count; i++) {
        for (let j = i + 1; j < count; j++) {
            edges.push({
                id: `e-collab-${i}-${j}`,
                source: `collab-${i}`,
                target: `collab-${j}`,
                style: { stroke: '#f59e0b', strokeWidth: 1, strokeDasharray: '4 4' },
            })
        }
    }

    return { nodes, edges }
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useWorkflowGraph(team: Team | null, agents: Agent[]) {
    return useMemo(() => {
        if (!team) return { nodes: [], edges: [] }

        switch (team.mode) {
            case 'pipeline':
                return pipelineToGraph(team.config as PipelineConfig, agents)
            case 'orchestrator':
                return orchestratorToGraph(team.config as OrchestratorConfig, agents)
            case 'collaboration':
                return collaborationToGraph(team.config as CollaborationConfig, agents)
            default:
                return { nodes: [], edges: [] }
        }
    }, [team, agents])
}
