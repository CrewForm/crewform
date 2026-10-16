// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { Agent, CollaborationConfig } from '@/types'

interface CollaborationConfigPanelProps {
    agents: Agent[]
    config: CollaborationConfig
    onChange: (config: CollaborationConfig) => void
}

const SPEAKER_OPTIONS = [
    { value: 'round_robin', label: 'Round Robin', description: 'Agents take turns in order' },
    { value: 'llm_select', label: 'LLM Selects', description: 'An LLM picks the most relevant next speaker' },
    { value: 'facilitator', label: 'Facilitator', description: 'A facilitator agent decides who speaks next' },
] as const

const TERMINATION_OPTIONS = [
    { value: 'max_turns', label: 'Max Turns', description: 'Stop after a fixed number of turns' },
    { value: 'consensus', label: 'Consensus', description: 'Stop when agents agree using a consensus phrase' },
    { value: 'facilitator_decision', label: 'Facilitator Decision', description: 'Facilitator ends the discussion' },
] as const

export function CollaborationConfigPanel({ agents, config, onChange }: CollaborationConfigPanelProps) {
    const [agentSearch, setAgentSearch] = useState('')

    const selectedAgents = agents.filter((a) => config.agent_ids.includes(a.id))
    const availableAgents = agents.filter(
        (a) =>
            !config.agent_ids.includes(a.id) &&
            a.name.toLowerCase().includes(agentSearch.toLowerCase()),
    )

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Participant Agents */}
            <div>
                <label style={{ fontWeight: 600, fontSize: '0.875rem', display: 'block', marginBottom: '0.25rem' }}>
                    💬 Participants ({selectedAgents.length})
                </label>
                <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginBottom: '0.5rem' }}>
                    Select at least 2 agents to participate in the discussion.
                </p>

                {/* Current participants */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    {selectedAgents.map((agent) => (
                        <span
                            key={agent.id}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                                padding: '0.25rem 0.5rem', borderRadius: '9999px',
                                background: 'var(--secondary)', fontSize: '0.75rem',
                            }}
                        >
                            {agent.name}
                            {config.facilitator_agent_id === agent.id && (
                                <span style={{ fontSize: '0.625rem', color: 'var(--muted-foreground)' }}> (facilitator)</span>
                            )}
                            <button
                                type="button"
                                onClick={() =>
                                    onChange({
                                        ...config,
                                        agent_ids: config.agent_ids.filter((id) => id !== agent.id),
                                        facilitator_agent_id: config.facilitator_agent_id === agent.id
                                            ? undefined
                                            : config.facilitator_agent_id,
                                    })
                                }
                                style={{ cursor: 'pointer', background: 'none', border: 'none', fontSize: '0.75rem' }}
                            >
                                ✕
                            </button>
                        </span>
                    ))}
                </div>

                {/* Add agent search */}
                <Input
                    placeholder="Search agents to add..."
                    value={agentSearch}
                    onChange={(e) => setAgentSearch(e.target.value)}
                />
                {agentSearch && availableAgents.length > 0 && (
                    <div style={{ maxHeight: '8rem', overflowY: 'auto', borderRadius: '0.375rem', border: '1px solid var(--border)', marginTop: '0.25rem' }}>
                        {availableAgents.map((agent) => (
                            <Button
                                key={agent.id}
                                variant="ghost"
                                className="w-full justify-start text-xs"
                                onClick={() => {
                                    onChange({
                                        ...config,
                                        agent_ids: [...config.agent_ids, agent.id],
                                    })
                                    setAgentSearch('')
                                }}
                            >
                                + {agent.name} ({agent.model})
                            </Button>
                        ))}
                    </div>
                )}
            </div>

            {/* Speaker Selection */}
            <div>
                <label style={{ fontWeight: 600, fontSize: '0.875rem', display: 'block', marginBottom: '0.25rem' }}>
                    🎤 Speaker Selection
                </label>
                <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginBottom: '0.5rem' }}>
                    How the next speaker is chosen each turn.
                </p>
                <select
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={config.speaker_selection}
                    onChange={(e) => onChange({ ...config, speaker_selection: e.target.value })}
                >
                    {SPEAKER_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                            {opt.label} — {opt.description}
                        </option>
                    ))}
                </select>
            </div>

            {/* Facilitator Agent (shown when speaker_selection or termination needs it) */}
            {(config.speaker_selection === 'facilitator' || config.termination_condition === 'facilitator_decision') && (
                <div>
                    <label style={{ fontWeight: 600, fontSize: '0.875rem', display: 'block', marginBottom: '0.25rem' }}>
                        🎯 Facilitator Agent
                    </label>
                    <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginBottom: '0.5rem' }}>
                        The facilitator guides the discussion and decides who speaks next.
                    </p>
                    <select
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={config.facilitator_agent_id ?? ''}
                        onChange={(e) => {
                            const agentId = e.target.value || undefined
                            const updates: CollaborationConfig = { ...config, facilitator_agent_id: agentId }
                            // Auto-add facilitator to participants if not already included
                            if (agentId && !config.agent_ids.includes(agentId)) {
                                updates.agent_ids = [...config.agent_ids, agentId]
                            }
                            onChange(updates)
                        }}
                    >
                        <option value="">Select facilitator...</option>
                        {agents.map((agent) => (
                            <option key={agent.id} value={agent.id}>
                                {agent.name} ({agent.model})
                            </option>
                        ))}
                    </select>
                </div>
            )}

            {/* Max Turns */}
            <div>
                <label style={{ fontWeight: 600, fontSize: '0.875rem', display: 'block', marginBottom: '0.25rem' }}>
                    🔄 Max Turns: {config.max_turns}
                </label>
                <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginBottom: '0.5rem' }}>
                    Maximum number of discussion turns before the conversation ends.
                </p>
                <input
                    type="range"
                    min={2}
                    max={50}
                    value={config.max_turns}
                    onChange={(e) => onChange({ ...config, max_turns: parseInt(e.target.value) })}
                    style={{ width: '100%' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.625rem', color: 'var(--muted-foreground)' }}>
                    <span>2</span>
                    <span>50</span>
                </div>
            </div>

            {/* Termination Condition */}
            <div>
                <label style={{ fontWeight: 600, fontSize: '0.875rem', display: 'block', marginBottom: '0.25rem' }}>
                    ⏹️ Termination Condition
                </label>
                <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginBottom: '0.5rem' }}>
                    When should the discussion end (in addition to the max turns limit)?
                </p>
                <select
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={config.termination_condition}
                    onChange={(e) => onChange({ ...config, termination_condition: e.target.value })}
                >
                    {TERMINATION_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                            {opt.label} — {opt.description}
                        </option>
                    ))}
                </select>
            </div>

            {/* Consensus Phrase (shown when termination = consensus) */}
            {config.termination_condition === 'consensus' && (
                <div>
                    <label style={{ fontWeight: 600, fontSize: '0.875rem', display: 'block', marginBottom: '0.25rem' }}>
                        🤝 Consensus Phrase
                    </label>
                    <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginBottom: '0.5rem' }}>
                        When a majority of agents include this phrase, the discussion ends.
                    </p>
                    <Input
                        value={config.consensus_phrase}
                        onChange={(e) => onChange({ ...config, consensus_phrase: e.target.value })}
                        placeholder="I agree with the consensus"
                    />
                </div>
            )}
        </div>
    )
}
