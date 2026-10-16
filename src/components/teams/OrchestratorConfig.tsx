// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { Agent } from '@/types'

interface OrchestratorConfigProps {
    agents: Agent[]
    config: {
        brain_agent_id: string
        worker_agent_ids: string[]
        quality_threshold: number
        max_delegation_depth: number
    }
    onChange: (config: OrchestratorConfigProps['config']) => void
}

export function OrchestratorConfigPanel({ agents, config, onChange }: OrchestratorConfigProps) {
    const [workerSearch, setWorkerSearch] = useState('')

    const brainAgent = agents.find((a) => a.id === config.brain_agent_id)
    const workerAgents = agents.filter((a) => config.worker_agent_ids.includes(a.id))
    const availableWorkers = agents.filter(
        (a) =>
            a.id !== config.brain_agent_id &&
            !config.worker_agent_ids.includes(a.id) &&
            a.name.toLowerCase().includes(workerSearch.toLowerCase()),
    )

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Brain Agent Selection */}
            <div>
                <label style={{ fontWeight: 600, fontSize: '0.875rem', display: 'block', marginBottom: '0.25rem' }}>
                    🧠 Brain Agent (Orchestrator)
                </label>
                <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginBottom: '0.5rem' }}>
                    The brain agent analyzes tasks, delegates to workers, and evaluates quality.
                </p>
                <select
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={config.brain_agent_id}
                    onChange={(e) => onChange({ ...config, brain_agent_id: e.target.value })}
                >
                    <option value="">Select brain agent...</option>
                    {agents.map((agent) => (
                        <option key={agent.id} value={agent.id}>
                            {agent.name} ({agent.model})
                        </option>
                    ))}
                </select>
                {brainAgent && (
                    <div style={{ marginTop: '0.25rem', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid var(--border)', fontSize: '0.75rem' }}>
                        <strong>{brainAgent.name}</strong> · {brainAgent.provider} / {brainAgent.model}
                    </div>
                )}
            </div>

            {/* Worker Agents */}
            <div>
                <label style={{ fontWeight: 600, fontSize: '0.875rem', display: 'block', marginBottom: '0.25rem' }}>
                    👥 Worker Agents ({workerAgents.length})
                </label>
                <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginBottom: '0.5rem' }}>
                    Workers execute delegated subtasks. The brain decides which worker to use.
                </p>

                {/* Current workers */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    {workerAgents.map((agent) => (
                        <span
                            key={agent.id}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                                padding: '0.25rem 0.5rem', borderRadius: '9999px',
                                background: 'var(--secondary)', fontSize: '0.75rem',
                            }}
                        >
                            {agent.name}
                            <button
                                type="button"
                                onClick={() =>
                                    onChange({
                                        ...config,
                                        worker_agent_ids: config.worker_agent_ids.filter((id) => id !== agent.id),
                                    })
                                }
                                style={{ cursor: 'pointer', background: 'none', border: 'none', fontSize: '0.75rem' }}
                            >
                                ✕
                            </button>
                        </span>
                    ))}
                </div>

                {/* Add worker search */}
                <Input
                    placeholder="Search agents to add..."
                    value={workerSearch}
                    onChange={(e) => setWorkerSearch(e.target.value)}
                />
                {workerSearch && availableWorkers.length > 0 && (
                    <div style={{ maxHeight: '8rem', overflowY: 'auto', borderRadius: '0.375rem', border: '1px solid var(--border)', marginTop: '0.25rem' }}>
                        {availableWorkers.map((agent) => (
                            <Button
                                key={agent.id}
                                variant="ghost"
                                className="w-full justify-start text-xs"
                                onClick={() => {
                                    onChange({
                                        ...config,
                                        worker_agent_ids: [...config.worker_agent_ids, agent.id],
                                    })
                                    setWorkerSearch('')
                                }}
                            >
                                + {agent.name} ({agent.model})
                            </Button>
                        ))}
                    </div>
                )}
            </div>

            {/* Quality Threshold */}
            <div>
                <label style={{ fontWeight: 600, fontSize: '0.875rem', display: 'block', marginBottom: '0.25rem' }}>
                    Quality Threshold: {Math.round(config.quality_threshold * 100)}%
                </label>
                <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginBottom: '0.5rem' }}>
                    Brain requests revision if worker output quality is below this threshold.
                </p>
                <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(config.quality_threshold * 100)}
                    onChange={(e) => onChange({ ...config, quality_threshold: parseInt(e.target.value) / 100 })}
                    style={{ width: '100%' }}
                />
            </div>

            {/* Max Delegation Depth */}
            <div>
                <label style={{ fontWeight: 600, fontSize: '0.875rem', display: 'block', marginBottom: '0.25rem' }}>
                    Max Revision Rounds: {config.max_delegation_depth}
                </label>
                <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginBottom: '0.5rem' }}>
                    Maximum number of revision rounds per delegation before accepting.
                </p>
                <input
                    type="range"
                    min={1}
                    max={10}
                    value={config.max_delegation_depth}
                    onChange={(e) => onChange({ ...config, max_delegation_depth: parseInt(e.target.value) })}
                    style={{ width: '100%' }}
                />
            </div>
        </div>
    )
}
