// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

/**
 * Maps a TeamRun + TeamMessages into per-node execution states.
 *
 * Returns a Map<nodeId, ExecutionNodeState> so the canvas can render
 * visual indicators (glow, badges, animations) on each agent node.
 *
 * Returns null when no active run exists (canvas stays in edit-only mode).
 */

import { useMemo } from 'react'
import type { TeamRun, TeamMessage, TeamMode, PipelineConfig } from '@/types'

export type ExecutionNodeState = 'idle' | 'running' | 'completed' | 'failed'

interface UseExecutionStateOptions {
    run: TeamRun | null | undefined
    messages: TeamMessage[]
    mode: TeamMode
    teamConfig: PipelineConfig | Record<string, unknown>
}

/**
 * Derives per-node execution states from a team run.
 *
 * Pipeline: uses `run.current_step_idx` to mark steps as completed/running/idle.
 * Orchestrator: brain is running while run is active; workers inferred from messages.
 * Collaboration: all agents are running while run is active.
 */
export function useExecutionState({
    run,
    messages,
    mode,
    teamConfig,
}: UseExecutionStateOptions): Map<string, ExecutionNodeState> | null {
    return useMemo(() => {
        if (!run || run.status === 'pending' || run.status === 'cancelled') {
            return null
        }

        const stateMap = new Map<string, ExecutionNodeState>()
        const runDone = run.status === 'completed'
        const runFailed = run.status === 'failed'

        switch (mode) {
            case 'pipeline': {
                const config = teamConfig as PipelineConfig
                const steps = config.steps
                const currentIdx = run.current_step_idx

                steps.forEach((_step, idx) => {
                    const nodeId = `agent-${idx}`

                    if (runDone) {
                        stateMap.set(nodeId, 'completed')
                    } else if (runFailed) {
                        if (currentIdx !== null && idx < currentIdx) {
                            stateMap.set(nodeId, 'completed')
                        } else if (currentIdx !== null && idx === currentIdx) {
                            stateMap.set(nodeId, 'failed')
                        } else {
                            stateMap.set(nodeId, 'idle')
                        }
                    } else {
                        // Running
                        if (currentIdx !== null && idx < currentIdx) {
                            stateMap.set(nodeId, 'completed')
                        } else if (currentIdx !== null && idx === currentIdx) {
                            stateMap.set(nodeId, 'running')
                        } else {
                            stateMap.set(nodeId, 'idle')
                        }
                    }
                })

                // Start/end nodes
                if (runDone) {
                    stateMap.set('start', 'completed')
                    stateMap.set('end', 'completed')
                } else if (runFailed) {
                    stateMap.set('start', 'completed')
                    stateMap.set('end', 'failed')
                } else {
                    stateMap.set('start', 'completed')
                    stateMap.set('end', 'idle')
                }
                break
            }

            case 'orchestrator': {
                // Brain node
                if (runDone) {
                    stateMap.set('brain', 'completed')
                } else if (runFailed) {
                    stateMap.set('brain', 'failed')
                } else {
                    stateMap.set('brain', 'running')
                }

                // Determine worker states from messages
                const workerAgentIds = new Set<string>()
                const completedWorkers = new Set<string>()
                const failedWorkers = new Set<string>()

                for (const msg of messages) {
                    if (msg.message_type === 'delegation' && msg.receiver_agent_id) {
                        workerAgentIds.add(msg.receiver_agent_id)
                    }
                    if (msg.message_type === 'result' && msg.sender_agent_id) {
                        completedWorkers.add(msg.sender_agent_id)
                    }
                    if (msg.message_type === 'rejection' && msg.sender_agent_id) {
                        failedWorkers.add(msg.sender_agent_id)
                    }
                }

                // Map worker agent IDs to node IDs
                const config = teamConfig as { worker_agent_ids?: string[] }
                const workerIds = config.worker_agent_ids ?? []
                workerIds.forEach((agentId, idx) => {
                    const nodeId = `worker-${idx}`
                    if (runDone) {
                        stateMap.set(nodeId, 'completed')
                    } else if (completedWorkers.has(agentId)) {
                        stateMap.set(nodeId, 'completed')
                    } else if (failedWorkers.has(agentId)) {
                        stateMap.set(nodeId, 'failed')
                    } else if (workerAgentIds.has(agentId)) {
                        stateMap.set(nodeId, 'running')
                    } else {
                        stateMap.set(nodeId, 'idle')
                    }
                })

                // Start/end
                stateMap.set('start', 'completed')
                stateMap.set('end', runDone ? 'completed' : runFailed ? 'failed' : 'idle')
                break
            }

            case 'collaboration': {
                // All agents are active during the run
                const config = teamConfig as { agent_ids?: string[] }
                const agentIds = config.agent_ids ?? []

                agentIds.forEach((_agentId, idx) => {
                    const nodeId = `collab-${idx}`
                    if (runDone) {
                        stateMap.set(nodeId, 'completed')
                    } else if (runFailed) {
                        stateMap.set(nodeId, 'failed')
                    } else {
                        stateMap.set(nodeId, 'running')
                    }
                })
                break
            }

            default:
                return null
        }

        return stateMap
    }, [run, messages, mode, teamConfig])
}
