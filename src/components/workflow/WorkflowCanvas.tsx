// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

/**
 * Visual workflow canvas using React Flow.
 * Renders the team's config as an interactive node graph.
 */

import { useCallback, useMemo, useState } from 'react'
import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    useNodesState,
    useEdgesState,
    BackgroundVariant,
    Panel,
} from '@xyflow/react'
import type { Node, NodeTypes } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import './workflow.css'

import { AgentNode } from './nodes/AgentNode'
import { StartNode } from './nodes/StartNode'
import { EndNode } from './nodes/EndNode'
import { useWorkflowGraph } from './useWorkflowGraph'
import { WorkflowSidebar } from './WorkflowSidebar'
import type { Agent, Team } from '@/types'
import { Bot } from 'lucide-react'

const NODE_TYPES: NodeTypes = {
    agentNode: AgentNode,
    startNode: StartNode,
    endNode: EndNode,
}

interface WorkflowCanvasProps {
    team: Team
    agents: Agent[]
}

export function WorkflowCanvas({ team, agents }: WorkflowCanvasProps) {
    const { nodes: initialNodes, edges: initialEdges } = useWorkflowGraph(team, agents)
    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

    // Sync graph when team config changes
    useMemo(() => {
        setNodes(initialNodes)
        setEdges(initialEdges)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialNodes, initialEdges])

    const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
        setSelectedNodeId(node.id)
    }, [])

    const onPaneClick = useCallback(() => {
        setSelectedNodeId(null)
    }, [])

    // Find the selected agent info for the sidebar
    const selectedNode = nodes.find((n) => n.id === selectedNodeId)

    // Mode label
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
                    onNodeClick={onNodeClick}
                    onPaneClick={onPaneClick}
                    nodeTypes={NODE_TYPES}
                    fitView
                    fitViewOptions={{ padding: 0.3 }}
                    proOptions={{ hideAttribution: true }}
                    minZoom={0.3}
                    maxZoom={2}
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
                        </div>
                    </Panel>
                </ReactFlow>
            </div>

            {/* Sidebar */}
            <WorkflowSidebar
                team={team}
                agents={agents}
                selectedNode={selectedNode ?? null}
            />
        </div>
    )
}
