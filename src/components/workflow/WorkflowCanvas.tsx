// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

/**
 * Visual workflow canvas using React Flow.
 * Phase 2: Supports interactive editing — add, remove, reorder agents on the canvas.
 */

import { useCallback, useMemo, useState, useRef, type DragEvent } from 'react'
import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    useNodesState,
    useEdgesState,
    BackgroundVariant,
    Panel,
    addEdge,
} from '@xyflow/react'
import type { Node, Edge, NodeTypes, Connection } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import './workflow.css'

import { AgentNode } from './nodes/AgentNode'
import { StartNode } from './nodes/StartNode'
import { EndNode } from './nodes/EndNode'
import { useWorkflowGraph, graphToConfig, validateConfig } from './useWorkflowGraph'
import { WorkflowSidebar } from './WorkflowSidebar'
import type { Agent, Team, PipelineConfig, PipelineStep, OrchestratorConfig, CollaborationConfig } from '@/types'
import type { AgentNodeData } from './nodes/AgentNode'
import { Bot, AlertCircle } from 'lucide-react'

const NODE_TYPES: NodeTypes = {
    agentNode: AgentNode,
    startNode: StartNode,
    endNode: EndNode,
}

type TeamConfig = PipelineConfig | OrchestratorConfig | CollaborationConfig

interface WorkflowCanvasProps {
    team: Team
    agents: Agent[]
    onSaveConfig: (config: TeamConfig) => Promise<void>
    onCanvasError?: (message: string) => void
}

export function WorkflowCanvas({ team, agents, onSaveConfig, onCanvasError }: WorkflowCanvasProps) {
    const { nodes: initialNodes, edges: initialEdges } = useWorkflowGraph(team, agents)
    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
    const [canvasError, setCanvasError] = useState<string | null>(null)
    const [isSaving, setIsSaving] = useState(false)

    // Snapshot for rollback
    const snapshotRef = useRef<{ nodes: Node[]; edges: Edge[] }>({ nodes: initialNodes, edges: initialEdges })

    // Sync graph when team config changes externally (e.g. from form view)
    useMemo(() => {
        setNodes(initialNodes)
        setEdges(initialEdges)
        snapshotRef.current = { nodes: initialNodes, edges: initialEdges }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialNodes, initialEdges])

    // ─── Save logic ──────────────────────────────────────────────────────────

    const saveGraph = useCallback(async (updatedNodes: Node[], updatedEdges: Edge[]) => {
        setCanvasError(null)
        try {
            const config = graphToConfig(
                updatedNodes,
                updatedEdges,
                team.mode,
                agents,
                team.config,
            )
            const validation = validateConfig(config, team.mode)
            if (!validation.valid) {
                setCanvasError(validation.error ?? 'Invalid configuration')
                // Revert
                setNodes(snapshotRef.current.nodes)
                setEdges(snapshotRef.current.edges)
                return
            }

            setIsSaving(true)
            await onSaveConfig(config)
            // Update snapshot on success
            snapshotRef.current = { nodes: updatedNodes, edges: updatedEdges }
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to save'
            setCanvasError(msg)
            // Revert on DB failure
            setNodes(snapshotRef.current.nodes)
            setEdges(snapshotRef.current.edges)
            onCanvasError?.(msg)
        } finally {
            setIsSaving(false)
        }
    }, [team, agents, onSaveConfig, onCanvasError, setNodes, setEdges])

    // ─── Node interactions ───────────────────────────────────────────────────

    const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
        setSelectedNodeId(node.id)
    }, [])

    const onPaneClick = useCallback(() => {
        setSelectedNodeId(null)
    }, [])

    // ─── Edge creation (pipeline mode) ───────────────────────────────────────

    const onConnect = useCallback((connection: Connection) => {
        if (team.mode !== 'pipeline') return // Only pipeline supports manual edge creation

        setEdges((eds) => {
            const updated = addEdge(
                {
                    ...connection,
                    animated: true,
                    style: { stroke: '#6bedb9', strokeWidth: 2 },
                },
                eds,
            )
            // Get latest nodes from state for save
            setNodes((currentNodes) => {
                void saveGraph(currentNodes, updated)
                return currentNodes
            })
            return updated
        })
    }, [team.mode, setEdges, setNodes, saveGraph])

    // ─── Node deletion ───────────────────────────────────────────────────────

    const onNodesDelete = useCallback((deletedNodes: Node[]) => {
        // Prevent deleting start/end nodes
        const protectedIds = ['start', 'end']
        const actualDeleted = deletedNodes.filter((n) => !protectedIds.includes(n.id))

        if (actualDeleted.length === 0) return

        // Prevent deleting brain in orchestrator
        if (team.mode === 'orchestrator') {
            const brainDeleted = actualDeleted.find((n) => {
                const role = (n.data as AgentNodeData).role
                return role === 'brain' || role === 'orchestrator'
            })
            if (brainDeleted) {
                setCanvasError('Cannot remove the brain agent from an orchestrator team.')
                // Revert
                setNodes(snapshotRef.current.nodes)
                setEdges(snapshotRef.current.edges)
                return
            }
        }

        // Save after deletion
        setNodes((currentNodes) => {
            const remaining = currentNodes.filter(
                (n) => !actualDeleted.some((d) => d.id === n.id),
            )
            setEdges((currentEdges) => {
                // Remove edges connected to deleted nodes
                const deletedIds = new Set(actualDeleted.map((n) => n.id))
                const remainingEdges = currentEdges.filter(
                    (e) => !deletedIds.has(e.source) && !deletedIds.has(e.target),
                )
                void saveGraph(remaining, remainingEdges)
                return remainingEdges
            })
            return remaining
        })
    }, [team.mode, setNodes, setEdges, saveGraph])

    // ─── Drag & Drop from sidebar ────────────────────────────────────────────

    const onDragOver = useCallback((event: DragEvent) => {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
    }, [])

    const onDrop = useCallback((event: DragEvent) => {
        event.preventDefault()

        const agentId = event.dataTransfer.getData('application/crewform-agent')
        if (!agentId) return

        const agent = agents.find((a) => a.id === agentId)
        if (!agent) return

        // Get drop position relative to the canvas
        const bounds = (event.target as HTMLElement).closest('.react-flow')?.getBoundingClientRect()
        if (!bounds) return

        const position = {
            x: event.clientX - bounds.left,
            y: event.clientY - bounds.top,
        }

        const nodeId = `agent-${Date.now()}`
        const role = team.mode === 'orchestrator' ? 'worker' : 'worker'

        const newNode: Node = {
            id: nodeId,
            type: 'agentNode',
            position,
            data: {
                label: agent.name,
                model: agent.model,
                role,
                avatarUrl: agent.avatar_url ?? null,
                agentId: agent.id,
            } satisfies AgentNodeData & { agentId: string },
            draggable: true,
        }

        setNodes((currentNodes) => {
            const updated = [...currentNodes, newNode]

            // For pipeline mode, auto-connect to the last agent or start
            if (team.mode === 'pipeline') {
                setEdges((currentEdges) => {
                    // Find the node that currently connects to 'end'
                    const endEdgeIdx = currentEdges.findIndex((e) => e.target === 'end')
                    let updatedEdges = [...currentEdges]

                    if (endEdgeIdx >= 0) {
                        const previousSource = currentEdges[endEdgeIdx].source
                        // Remove old edge to end
                        updatedEdges.splice(endEdgeIdx, 1)
                        // Connect previous → new node → end
                        updatedEdges = [
                            ...updatedEdges,
                            {
                                id: `e-${previousSource}-${nodeId}`,
                                source: previousSource,
                                target: nodeId,
                                animated: true,
                                style: { stroke: '#6bedb9', strokeWidth: 2 },
                            },
                            {
                                id: `e-${nodeId}-end`,
                                source: nodeId,
                                target: 'end',
                                animated: true,
                                style: { stroke: '#6bedb9', strokeWidth: 2 },
                            },
                        ]
                    }
                    void saveGraph(updated, updatedEdges)
                    return updatedEdges
                })
            } else if (team.mode === 'orchestrator') {
                setEdges((currentEdges) => {
                    // Connect brain to new worker
                    const updatedEdges = [
                        ...currentEdges,
                        {
                            id: `e-brain-${nodeId}`,
                            source: 'brain',
                            target: nodeId,
                            animated: true,
                            style: { stroke: '#a78bfa', strokeWidth: 1.5, strokeDasharray: '6 3' },
                            label: 'delegates',
                            labelStyle: { fill: '#6b7280', fontSize: 10 },
                        },
                    ]
                    void saveGraph(updated, updatedEdges)
                    return updatedEdges
                })
            } else {
                // Collaboration: add edges to all existing agent nodes
                setEdges((currentEdges) => {
                    const existingAgentNodes = currentNodes.filter((n) => n.type === 'agentNode')
                    const newEdges = existingAgentNodes.map((an) => ({
                        id: `e-collab-${an.id}-${nodeId}`,
                        source: an.id,
                        target: nodeId,
                        style: { stroke: '#f59e0b', strokeWidth: 1, strokeDasharray: '4 4' },
                    }))
                    const updatedEdges = [...currentEdges, ...newEdges]
                    void saveGraph(updated, updatedEdges)
                    return updatedEdges
                })
            }

            return updated
        })
    }, [agents, team.mode, setNodes, setEdges, saveGraph])

    // ─── Sidebar callbacks ───────────────────────────────────────────────────

    const handleDeleteNode = useCallback((nodeId: string) => {
        const node = nodes.find((n) => n.id === nodeId)
        if (node) {
            onNodesDelete([node])
        }
    }, [nodes, onNodesDelete])

    const handleStepUpdate = useCallback(async (stepIndex: number, updates: Partial<PipelineStep>) => {
        if (team.mode !== 'pipeline') return

        const config = team.config as PipelineConfig
        const updatedSteps = config.steps.map((step, idx) =>
            idx === stepIndex ? { ...step, ...updates } : step,
        )
        const updatedConfig: PipelineConfig = { ...config, steps: updatedSteps }

        setCanvasError(null)
        setIsSaving(true)
        try {
            await onSaveConfig(updatedConfig)
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to save step config'
            setCanvasError(msg)
        } finally {
            setIsSaving(false)
        }
    }, [team, onSaveConfig])

    // ─── Render ──────────────────────────────────────────────────────────────

    const selectedNode = nodes.find((n) => n.id === selectedNodeId)
    const modeLabel = team.mode.charAt(0).toUpperCase() + team.mode.slice(1)
    const stepCount = nodes.filter((n) => n.type === 'agentNode').length

    return (
        <div className="workflow-canvas-container flex rounded-xl border border-border bg-surface-card overflow-hidden" style={{ height: 560 }}>
            {/* Canvas */}
            <div className="flex-1 relative">
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    onNodeClick={onNodeClick}
                    onPaneClick={onPaneClick}
                    onNodesDelete={onNodesDelete}
                    onDragOver={onDragOver}
                    onDrop={onDrop}
                    nodeTypes={NODE_TYPES}
                    fitView
                    fitViewOptions={{ padding: 0.3 }}
                    proOptions={{ hideAttribution: true }}
                    minZoom={0.3}
                    maxZoom={2}
                    deleteKeyCode="Delete"
                    className="workflow-flow"
                >
                    <Background
                        variant={BackgroundVariant.Dots}
                        gap={20}
                        size={1}
                        color="rgba(255,255,255,0.05)"
                    />
                    <Controls
                        className="workflow-controls"
                        showInteractive={false}
                    />
                    <MiniMap
                        className="workflow-minimap"
                        nodeColor="#6bedb9"
                        maskColor="rgba(0,0,0,0.7)"
                    />

                    {/* Info panel */}
                    <Panel position="top-left" className="workflow-info-panel">
                        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-card/90 px-3 py-1.5 backdrop-blur-sm">
                            <Bot className="h-3.5 w-3.5 text-brand-primary" />
                            <span className="text-xs font-medium text-gray-300">
                                {modeLabel}
                            </span>
                            <span className="text-[10px] text-gray-500">
                                {stepCount} agent{stepCount !== 1 ? 's' : ''}
                            </span>
                            {isSaving && (
                                <span className="text-[10px] text-brand-primary animate-pulse">
                                    Saving…
                                </span>
                            )}
                        </div>
                    </Panel>

                    {/* Canvas error toast */}
                    {canvasError && (
                        <Panel position="top-center" className="workflow-error-panel">
                            <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 backdrop-blur-sm">
                                <AlertCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                                <span className="text-xs text-red-400">{canvasError}</span>
                                <button
                                    type="button"
                                    onClick={() => setCanvasError(null)}
                                    className="ml-2 text-[10px] text-gray-500 hover:text-gray-300"
                                >
                                    ✕
                                </button>
                            </div>
                        </Panel>
                    )}
                </ReactFlow>
            </div>

            {/* Sidebar */}
            <WorkflowSidebar
                team={team}
                agents={agents}
                selectedNode={selectedNode ?? null}
                onDeleteNode={handleDeleteNode}
                onStepUpdate={(idx, updates) => { void handleStepUpdate(idx, updates) }}
                draggable
            />
        </div>
    )
}
