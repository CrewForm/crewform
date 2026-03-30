// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

/**
 * Visual workflow canvas using React Flow.
 * Phase 3: Enhanced with execution state visualization, detail popups,
 * context menus, execution timeline, and camera following.
 */

import { useCallback, useMemo, useState, useRef, useEffect, type DragEvent } from 'react'
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
    useReactFlow,
    ReactFlowProvider,
} from '@xyflow/react'
import type { Node, Edge, NodeTypes, Connection } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import './workflow.css'

import { AgentNode } from './nodes/AgentNode'
import { StartNode } from './nodes/StartNode'
import { EndNode } from './nodes/EndNode'
import { useWorkflowGraph, graphToConfig, validateConfig } from './useWorkflowGraph'
import { useCanvasHistory } from './useCanvasHistory'
import { useAutoLayout } from './useAutoLayout'
import { useExecutionState } from './useExecutionState'
import { useCanvasCamera, usePanToNode } from './useCanvasCamera'
import { WorkflowSidebar } from './WorkflowSidebar'
import { NodeDetailPopup } from './NodeDetailPopup'
import { CanvasContextMenu, type ContextMenuState } from './CanvasContextMenu'
import { ExecutionTimeline } from './ExecutionTimeline'
import type { Agent, Team, PipelineConfig, OrchestratorConfig, CollaborationConfig, TeamRun, TeamMessage } from '@/types'
import type { AgentNodeData } from './nodes/AgentNode'
import { Bot, AlertCircle, Undo2, Redo2, LayoutGrid, Navigation } from 'lucide-react'

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
    /** Active team run for execution visualization */
    activeRun?: TeamRun | null
    /** Messages from the active run */
    runMessages?: TeamMessage[]
}

function WorkflowCanvasInner({ team, agents, onSaveConfig, onCanvasError, activeRun, runMessages = [] }: WorkflowCanvasProps) {
    const { nodes: initialNodes, edges: initialEdges } = useWorkflowGraph(team, agents)
    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
    const [showPopup, setShowPopup] = useState(false)
    const [canvasError, setCanvasError] = useState<string | null>(null)
    const [isSaving, setIsSaving] = useState(false)
    const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
    const [cameraFollowEnabled, setCameraFollowEnabled] = useState(true)

    const reactFlowInstance = useReactFlow()

    // Undo/redo history
    const { pushState, undo, redo, canUndo, canRedo, resetHistory } = useCanvasHistory(setNodes, setEdges)

    // Auto-layout
    const { applyAutoLayout } = useAutoLayout()

    // Execution state
    const executionStates = useExecutionState({
        run: activeRun,
        messages: runMessages,
        mode: team.mode,
        teamConfig: team.config as PipelineConfig,
    })

    // Camera follow
    useCanvasCamera(executionStates, cameraFollowEnabled && !!activeRun)

    // Pan to node (for timeline clicks)
    const panToNode = usePanToNode()

    // Snapshot for rollback
    const snapshotRef = useRef<{ nodes: Node[]; edges: Edge[] }>({ nodes: initialNodes, edges: initialEdges })

    // Sync graph when team config changes externally (e.g. from form view)
    useMemo(() => {
        setNodes(initialNodes)
        setEdges(initialEdges)
        snapshotRef.current = { nodes: initialNodes, edges: initialEdges }
        resetHistory()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialNodes, initialEdges])

    // Apply execution states to node data
    useMemo(() => {
        if (!executionStates) return
        setNodes((currentNodes) =>
            currentNodes.map((node) => {
                const execState = executionStates.get(node.id)
                if (execState && node.type === 'agentNode') {
                    return {
                        ...node,
                        data: { ...node.data, executionState: execState },
                    }
                }
                return node
            }),
        )
    }, [executionStates, setNodes])

    // Listen for undo/redo keyboard events
    useEffect(() => {
        const handleUndo = () => { undo(nodes, edges) }
        const handleRedo = () => { redo(nodes, edges) }
        window.addEventListener('canvas:undo', handleUndo)
        window.addEventListener('canvas:redo', handleRedo)
        return () => {
            window.removeEventListener('canvas:undo', handleUndo)
            window.removeEventListener('canvas:redo', handleRedo)
        }
    }, [undo, redo, nodes, edges])

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
        if (selectedNodeId === node.id && showPopup) {
            // Toggle popup off
            setShowPopup(false)
            setSelectedNodeId(null)
        } else {
            setSelectedNodeId(node.id)
            setShowPopup(true)
        }
        setContextMenu(null)
    }, [selectedNodeId, showPopup])

    const onPaneClick = useCallback(() => {
        setSelectedNodeId(null)
        setShowPopup(false)
        setContextMenu(null)
    }, [])

    // ─── Context menu ────────────────────────────────────────────────────────

    const onNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
        event.preventDefault()
        setContextMenu({ x: event.clientX, y: event.clientY, nodeId: node.id })
        setShowPopup(false)
    }, [])

    const onPaneContextMenu = useCallback((event: React.MouseEvent | MouseEvent) => {
        event.preventDefault()
        setContextMenu({ x: (event as React.MouseEvent).clientX, y: (event as React.MouseEvent).clientY, nodeId: null })
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
                pushState(currentNodes, eds)
                void saveGraph(currentNodes, updated)
                return currentNodes
            })
            return updated
        })
    }, [team.mode, setEdges, setNodes, saveGraph, pushState])

    // ─── Node drag stop (persist position) ────────────────────────────────────

    const onNodeDragStop = useCallback(() => {
        // Save positions after dragging — reads latest state
        setNodes((currentNodes) => {
            setEdges((currentEdges) => {
                void saveGraph(currentNodes, currentEdges)
                return currentEdges
            })
            return currentNodes
        })
    }, [setNodes, setEdges, saveGraph])

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
                pushState(currentNodes, currentEdges)
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
    }, [team.mode, setNodes, setEdges, saveGraph, pushState])

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
                    pushState(currentNodes, currentEdges)
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
    }, [agents, team.mode, setNodes, setEdges, saveGraph, pushState])

    // ─── Auto-layout ─────────────────────────────────────────────────────────

    const handleAutoLayout = useCallback(() => {
        setNodes((currentNodes) => {
            setEdges((currentEdges) => {
                pushState(currentNodes, currentEdges)
                const direction = team.mode === 'collaboration' ? 'LR' : 'TB'
                const layoutedNodes = applyAutoLayout(currentNodes, currentEdges, { direction })
                setNodes(layoutedNodes)
                void saveGraph(layoutedNodes, currentEdges)
                return currentEdges
            })
            return currentNodes
        })
    }, [setNodes, setEdges, pushState, applyAutoLayout, team.mode, saveGraph])

    // ─── Sidebar callbacks ───────────────────────────────────────────────────

    const handleDeleteNode = useCallback((nodeId: string) => {
        const node = nodes.find((n) => n.id === nodeId)
        if (node) {
            onNodesDelete([node])
            setSelectedNodeId(null)
            setShowPopup(false)
        }
    }, [nodes, onNodesDelete])

    // ─── Fit view ────────────────────────────────────────────────────────────

    const handleFitView = useCallback(() => {
        void reactFlowInstance.fitView({ duration: 400, padding: 0.3 })
    }, [reactFlowInstance])

    // ─── Navigate to agent ───────────────────────────────────────────────────

    const handleGoToAgent = useCallback((agentId: string) => {
        window.location.href = `/agents/${agentId}`
    }, [])

    // ─── Render ──────────────────────────────────────────────────────────────

    const selectedNode = nodes.find((n) => n.id === selectedNodeId)
    const modeLabel = team.mode.charAt(0).toUpperCase() + team.mode.slice(1)
    const stepCount = nodes.filter((n) => n.type === 'agentNode').length
    const hasActiveRun = activeRun && (activeRun.status === 'running' || activeRun.status === 'completed' || activeRun.status === 'failed')

    return (
        <div className="workflow-canvas-container flex flex-col rounded-xl border border-border bg-surface-card overflow-hidden">
            <div className="flex flex-1" style={{ height: hasActiveRun ? 480 : 560 }}>
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
                        onNodeDragStop={onNodeDragStop}
                        onDragOver={onDragOver}
                        onDrop={onDrop}
                        onNodeContextMenu={onNodeContextMenu}
                        onPaneContextMenu={onPaneContextMenu}
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
                                <span className="mx-1 text-gray-600">|</span>
                                <button
                                    type="button"
                                    onClick={() => { undo(nodes, edges) }}
                                    disabled={!canUndo}
                                    className="rounded p-0.5 text-gray-400 hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
                                    title="Undo (Ctrl+Z)"
                                >
                                    <Undo2 className="h-3.5 w-3.5" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { redo(nodes, edges) }}
                                    disabled={!canRedo}
                                    className="rounded p-0.5 text-gray-400 hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
                                    title="Redo (Ctrl+Shift+Z)"
                                >
                                    <Redo2 className="h-3.5 w-3.5" />
                                </button>
                                <button
                                    type="button"
                                    onClick={handleAutoLayout}
                                    className="rounded p-0.5 text-gray-400 hover:text-gray-200"
                                    title="Auto-layout"
                                >
                                    <LayoutGrid className="h-3.5 w-3.5" />
                                </button>
                                {hasActiveRun && (
                                    <>
                                        <span className="mx-1 text-gray-600">|</span>
                                        <button
                                            type="button"
                                            onClick={() => setCameraFollowEnabled(!cameraFollowEnabled)}
                                            className={`rounded p-0.5 transition-colors ${
                                                cameraFollowEnabled
                                                    ? 'text-brand-primary'
                                                    : 'text-gray-500 hover:text-gray-300'
                                            }`}
                                            title={cameraFollowEnabled ? 'Camera follow: ON' : 'Camera follow: OFF'}
                                        >
                                            <Navigation className="h-3.5 w-3.5" />
                                        </button>
                                    </>
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
                    agents={agents}
                    draggable
                />
            </div>

            {/* Execution Timeline */}
            {hasActiveRun && (
                <ExecutionTimeline
                    run={activeRun}
                    mode={team.mode}
                    agents={agents}
                    teamConfig={team.config}
                    executionStates={executionStates}
                    onStepClick={panToNode}
                />
            )}

            {/* Detail Popup (portal-style, positioned via fixed) */}
            {showPopup && selectedNode && selectedNode.type === 'agentNode' && (
                <NodeDetailPopup
                    node={selectedNode}
                    team={team}
                    agents={agents}
                    executionStates={executionStates}
                    onDelete={handleDeleteNode}
                    onClose={() => { setShowPopup(false); setSelectedNodeId(null) }}
                />
            )}

            {/* Context Menu */}
            {contextMenu && (
                <CanvasContextMenu
                    state={contextMenu}
                    nodes={nodes}
                    teamMode={team.mode}
                    onClose={() => setContextMenu(null)}
                    onDeleteNode={handleDeleteNode}
                    onFitView={handleFitView}
                    onAutoLayout={handleAutoLayout}
                    onGoToAgent={handleGoToAgent}
                />
            )}
        </div>
    )
}

/**
 * Wrapped component that provides ReactFlowProvider.
 * Required for hooks like useReactFlow() to work inside the canvas.
 */
export function WorkflowCanvas(props: WorkflowCanvasProps) {
    return (
        <ReactFlowProvider>
            <WorkflowCanvasInner {...props} />
        </ReactFlowProvider>
    )
}
