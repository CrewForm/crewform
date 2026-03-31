// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

/**
 * Hook that converts Team config ↔ React Flow node/edge graphs.
 *
 * Reads the existing PipelineConfig / OrchestratorConfig / CollaborationConfig
 * and generates a visual graph. Changes on the canvas write back to the same config.
 */

import { useMemo } from 'react'
import { MarkerType } from '@xyflow/react'
import type { Node, Edge } from '@xyflow/react'
import type {
    Agent,
    Team,
    PipelineConfig,
    PipelineStep,
    OrchestratorConfig,
    CollaborationConfig,
} from '@/types'
import type { AgentNodeData } from './nodes/AgentNode'

const Y_SPACING = 120
const X_CENTER = 300

/** Standard arrow marker for directional edge flow */
const ARROW_MARKER = {
    type: MarkerType.ArrowClosed,
    width: 16,
    height: 16,
    color: '#6bedb9',
}

const ARROW_MARKER_PURPLE = {
    type: MarkerType.ArrowClosed,
    width: 16,
    height: 16,
    color: '#a78bfa',
}

const ARROW_MARKER_AMBER = {
    type: MarkerType.ArrowClosed,
    width: 14,
    height: 14,
    color: '#f59e0b',
}

const ARROW_MARKER_AMBER_DASHED = {
    type: MarkerType.ArrowClosed,
    width: 14,
    height: 14,
    color: '#f59e0b',
}

/**
 * Returns the correct handle IDs for a given layout direction.
 * TB (top-to-bottom): source from bottom, target to top
 * LR (left-to-right): source from right, target to left
 */
export function getHandleIds(direction: 'TB' | 'LR') {
    return direction === 'LR'
        ? { sourceHandle: 'right-source', targetHandle: 'left-target' }
        : { sourceHandle: 'bottom-source', targetHandle: 'top-target' }
}

/**
 * Update all edges in an array to use the correct handle IDs for a given direction.
 */
export function updateEdgeHandles(edges: Edge[], direction: 'TB' | 'LR'): Edge[] {
    const { sourceHandle, targetHandle } = getHandleIds(direction)
    return edges.map((edge) => ({
        ...edge,
        sourceHandle,
        targetHandle,
    }))
}

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
        position: config.node_positions?.start ?? { x: X_CENTER, y: 0 },
        data: {},
        draggable: true,
    })

    let yOffset = Y_SPACING
    let lastNodeId = 'start'

    config.steps.forEach((step, idx) => {
        if (step.type === 'fan_out' && step.parallel_agents && step.parallel_agents.length > 0) {
            // ── Fan-Out Step: render parallel agents + merge node ──
            const parallelIds = step.parallel_agents
            const count = parallelIds.length
            const spreadWidth = Math.max(count * 220, 400)
            const startX = X_CENTER - spreadWidth / 2 + 110

            // Parallel agent nodes
            parallelIds.forEach((agentId, pIdx) => {
                const agent = agentById(agents, agentId)
                const nodeId = `fanout-${idx}-branch-${pIdx}`
                const x = count === 1 ? X_CENTER : startX + pIdx * (spreadWidth / Math.max(count - 1, 1))

                nodes.push({
                    id: nodeId,
                    type: 'agentNode',
                    position: config.node_positions?.[nodeId] ?? { x, y: yOffset },
                    data: makeAgentNodeData(agent, 'worker'),
                    draggable: true,
                })

                // Edge from previous step to each parallel branch
                edges.push({
                    id: `e-${lastNodeId}-${nodeId}`,
                    source: lastNodeId,
                    target: nodeId,
                    animated: true,
                    style: { stroke: '#f59e0b', strokeWidth: 1.5, strokeDasharray: '6 3' },
                    label: pIdx === 0 ? 'fan-out' : undefined,
                    labelStyle: { fill: '#f59e0b', fontSize: 10 },
                    markerEnd: ARROW_MARKER_AMBER_DASHED,
                })
            })

            yOffset += Y_SPACING

            // Merge node (if merge_agent_id is set, or a synthetic merge point)
            const mergeNodeId = `fanout-${idx}-merge`
            if (step.merge_agent_id) {
                const mergeAgent = agentById(agents, step.merge_agent_id)
                nodes.push({
                    id: mergeNodeId,
                    type: 'agentNode',
                    position: config.node_positions?.[mergeNodeId] ?? { x: X_CENTER, y: yOffset },
                    data: makeAgentNodeData(mergeAgent, 'brain'),
                    draggable: true,
                })
            } else {
                // Synthetic merge point (no dedicated agent)
                nodes.push({
                    id: mergeNodeId,
                    type: 'startNode', // reuse start node style as a junction
                    position: config.node_positions?.[mergeNodeId] ?? { x: X_CENTER, y: yOffset },
                    data: {},
                    draggable: true,
                })
            }

            // Edges from each parallel branch to merge
            parallelIds.forEach((_agentId, pIdx) => {
                const branchNodeId = `fanout-${idx}-branch-${pIdx}`
                edges.push({
                    id: `e-${branchNodeId}-${mergeNodeId}`,
                    source: branchNodeId,
                    target: mergeNodeId,
                    animated: true,
                    style: { stroke: '#f59e0b', strokeWidth: 1.5 },
                    markerEnd: ARROW_MARKER_AMBER,
                })
            })

            lastNodeId = mergeNodeId
            yOffset += Y_SPACING
        } else {
            // ── Sequential Step ──
            const agent = agentById(agents, step.agent_id)
            const nodeId = `agent-${idx}`
            nodes.push({
                id: nodeId,
                type: 'agentNode',
                position: config.node_positions?.[nodeId] ?? { x: X_CENTER, y: yOffset },
                data: makeAgentNodeData(agent, 'worker'),
                draggable: true,
            })

            edges.push({
                id: `e-${lastNodeId}-${nodeId}`,
                source: lastNodeId,
                target: nodeId,
                animated: true,
                style: { stroke: '#6bedb9', strokeWidth: 2 },
                markerEnd: ARROW_MARKER,
            })

            lastNodeId = nodeId
            yOffset += Y_SPACING
        }
    })

    // End node
    nodes.push({
        id: 'end',
        type: 'endNode',
        position: config.node_positions?.end ?? { x: X_CENTER, y: yOffset },
        data: {},
        draggable: true,
    })

    edges.push({
        id: `e-${lastNodeId}-end`,
        source: lastNodeId,
        target: 'end',
        animated: true,
        style: { stroke: '#6bedb9', strokeWidth: 2 },
        markerEnd: ARROW_MARKER,
    })

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
        position: config.node_positions?.start ?? { x: X_CENTER, y: 0 },
        data: {},
        draggable: true,
    })

    // Brain agent (center)
    const brainAgent = agentById(agents, config.brain_agent_id)
    nodes.push({
        id: 'brain',
        type: 'agentNode',
        position: config.node_positions?.brain ?? { x: X_CENTER, y: Y_SPACING },
        data: makeAgentNodeData(brainAgent, 'brain'),
        draggable: true,
    })

    edges.push({
        id: 'e-start-brain',
        source: 'start',
        target: 'brain',
        animated: true,
        style: { stroke: '#a78bfa', strokeWidth: 2 },
        markerEnd: ARROW_MARKER_PURPLE,
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
            position: config.node_positions?.[nodeId] ?? { x, y: Y_SPACING * 2.5 },
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
            markerEnd: ARROW_MARKER_PURPLE,
        })
    })

    // End node
    const endY = Y_SPACING * 4
    nodes.push({
        id: 'end',
        type: 'endNode',
        position: config.node_positions?.end ?? { x: X_CENTER, y: endY },
        data: {},
        draggable: true,
    })

    edges.push({
        id: 'e-brain-end',
        source: 'brain',
        target: 'end',
        animated: true,
        style: { stroke: '#a78bfa', strokeWidth: 2 },
        markerEnd: ARROW_MARKER_PURPLE,
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
            position: config.node_positions?.[`collab-${idx}`] ?? { x, y },
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
                markerEnd: ARROW_MARKER_AMBER,
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

// ─── Validation ──────────────────────────────────────────────────────────────

export interface ConfigValidation {
    valid: boolean
    error?: string
}

export function validateConfig(
    config: PipelineConfig | OrchestratorConfig | CollaborationConfig,
    mode: string,
): ConfigValidation {
    switch (mode) {
        case 'pipeline': {
            const pc = config as PipelineConfig
            if (pc.steps.length < 1) {
                return { valid: false, error: 'Pipeline must have at least one step.' }
            }
            const missing = pc.steps.find((s) => !s.agent_id)
            if (missing) {
                return { valid: false, error: `Step "${missing.step_name || 'unnamed'}" needs an agent assigned.` }
            }
            return { valid: true }
        }
        case 'orchestrator': {
            const oc = config as OrchestratorConfig
            if (!oc.brain_agent_id) {
                return { valid: false, error: 'Orchestrator must have a brain agent.' }
            }
            return { valid: true }
        }
        case 'collaboration': {
            const cc = config as CollaborationConfig
            if (cc.agent_ids.length < 2) {
                return { valid: false, error: 'Collaboration needs at least 2 agents.' }
            }
            return { valid: true }
        }
        default:
            return { valid: false, error: `Unknown mode: ${mode}` }
    }
}

// ─── Position extraction ─────────────────────────────────────────────────────

function extractNodePositions(nodes: Node[]): Record<string, { x: number; y: number }> {
    const positions: Record<string, { x: number; y: number }> = {}
    for (const node of nodes) {
        positions[node.id] = { x: node.position.x, y: node.position.y }
    }
    return positions
}

// ─── Graph → Config (reverse) ────────────────────────────────────────────────

/**
 * Resolves the agent ID from a node's data, looking up the agent by name
 * if the data doesn't carry the original ID.
 */
function resolveAgentId(node: Node, agents: Agent[]): string {
    // agentId stored in node data during drag-from-sidebar
    const dataAgentId = node.data.agentId
    if (typeof dataAgentId === 'string' && dataAgentId) return dataAgentId

    // Fallback: look up by name
    const label = (node.data as AgentNodeData).label
    const agent = agents.find((a) => a.name === label)
    return agent?.id ?? ''
}

/**
 * Walk edges from 'start' to 'end' to determine the pipeline step order.
 * Falls back to y-position ordering if edges don't form a clean chain.
 */
function resolvePipelineOrder(nodes: Node[], edges: Edge[]): Node[] {
    const agentNodes = nodes.filter((n) => n.type === 'agentNode')

    // Build adjacency from source → target
    const edgeMap = new Map<string, string>()
    for (const e of edges) {
        edgeMap.set(e.source, e.target)
    }

    // Walk from 'start'
    const ordered: Node[] = []
    let currentId = edgeMap.get('start')
    const visited = new Set<string>()

    while (currentId && currentId !== 'end' && !visited.has(currentId)) {
        visited.add(currentId)
        const node = agentNodes.find((n) => n.id === currentId)
        if (node) ordered.push(node)
        currentId = edgeMap.get(currentId)
    }

    // If walk didn't capture all agents, fall back to y-position sort
    if (ordered.length !== agentNodes.length) {
        return [...agentNodes].sort((a, b) => a.position.y - b.position.y)
    }

    return ordered
}

export function graphToPipelineConfig(
    nodes: Node[],
    edges: Edge[],
    agents: Agent[],
    existingConfig: PipelineConfig,
): PipelineConfig {
    const orderedNodes = resolvePipelineOrder(nodes, edges)

    const steps: PipelineStep[] = orderedNodes.map((node, idx) => {
        const agentId = resolveAgentId(node, agents)

        // Preserve existing step config if this agent was already in the pipeline
        const existingStep = existingConfig.steps.find((s) => s.agent_id === agentId)

        return {
            agent_id: agentId,
            step_name: existingStep?.step_name ?? `Step ${idx + 1}`,
            instructions: existingStep?.instructions ?? '',
            expected_output: existingStep?.expected_output ?? '',
            on_failure: existingStep?.on_failure ?? 'stop',
            max_retries: existingStep?.max_retries ?? 1,
            // Preserve fan-out config
            ...(existingStep?.type === 'fan_out' ? {
                type: 'fan_out' as const,
                parallel_agents: existingStep.parallel_agents,
                merge_agent_id: existingStep.merge_agent_id,
                fan_out_failure: existingStep.fan_out_failure,
                merge_instructions: existingStep.merge_instructions,
            } : {}),
        }
    })

    return {
        ...existingConfig,
        steps,
        node_positions: extractNodePositions(nodes),
    }
}

export function graphToOrchestratorConfig(
    nodes: Node[],
    agents: Agent[],
    existingConfig: OrchestratorConfig,
): OrchestratorConfig {
    const agentNodes = nodes.filter((n) => n.type === 'agentNode')

    // The brain is the node with role 'brain' or 'orchestrator'
    const brainNode = agentNodes.find((n) => {
        const role = (n.data as AgentNodeData).role
        return role === 'brain' || role === 'orchestrator'
    })

    const brainAgentId = brainNode ? resolveAgentId(brainNode, agents) : existingConfig.brain_agent_id

    // Workers are all non-brain agent nodes
    const workerIds = agentNodes
        .filter((n) => n.id !== brainNode?.id)
        .map((n) => resolveAgentId(n, agents))
        .filter(Boolean)

    return {
        ...existingConfig,
        brain_agent_id: brainAgentId,
        worker_agent_ids: workerIds,
        node_positions: extractNodePositions(nodes),
    }
}

export function graphToCollaborationConfig(
    nodes: Node[],
    agents: Agent[],
    existingConfig: CollaborationConfig,
): CollaborationConfig {
    const agentNodes = nodes.filter((n) => n.type === 'agentNode')

    const agentIds = agentNodes
        .map((n) => resolveAgentId(n, agents))
        .filter(Boolean)

    // Preserve facilitator if still present
    const facilitatorId = existingConfig.facilitator_agent_id
    const facilitatorStillPresent = facilitatorId ? agentIds.includes(facilitatorId) : false

    return {
        ...existingConfig,
        agent_ids: agentIds,
        facilitator_agent_id: facilitatorStillPresent ? facilitatorId : undefined,
        node_positions: extractNodePositions(nodes),
    }
}

export function graphToConfig(
    nodes: Node[],
    edges: Edge[],
    mode: string,
    agents: Agent[],
    existingConfig: PipelineConfig | OrchestratorConfig | CollaborationConfig,
    layoutDirection?: 'TB' | 'LR',
): PipelineConfig | OrchestratorConfig | CollaborationConfig {
    let config: PipelineConfig | OrchestratorConfig | CollaborationConfig
    switch (mode) {
        case 'pipeline':
            config = graphToPipelineConfig(nodes, edges, agents, existingConfig as PipelineConfig)
            break
        case 'orchestrator':
            config = graphToOrchestratorConfig(nodes, agents, existingConfig as OrchestratorConfig)
            break
        case 'collaboration':
            config = graphToCollaborationConfig(nodes, agents, existingConfig as CollaborationConfig)
            break
        default:
            config = existingConfig
    }
    // Persist layout direction preference in config
    if (layoutDirection) {
        (config as unknown as Record<string, unknown>).layout_direction = layoutDirection
    }
    return config
}

