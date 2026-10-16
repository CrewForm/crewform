// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { useDelegations, type Delegation } from '@/hooks/useDelegations'
import { Card } from '@/components/ui/card'
import type { Agent } from '@/types'

interface DelegationTreeProps {
    teamRunId: string
    brainAgentId: string
    agents: Agent[]
}

const STATUS_STYLES: Record<string, { label: string; color: string }> = {
    pending: { label: '⏳ Pending', color: '#6b7280' },
    running: { label: '🔄 Running', color: '#3b82f6' },
    completed: { label: '✅ Completed', color: '#22c55e' },
    revision_requested: { label: '🔁 Revision', color: '#f59e0b' },
    failed: { label: '❌ Failed', color: '#ef4444' },
}

function DelegationNode({ delegation, agentName }: { delegation: Delegation; agentName: string }) {
    const statusStyle = STATUS_STYLES[delegation.status] ?? STATUS_STYLES.pending

    return (
        <div style={{ marginLeft: '2rem', borderLeft: '2px solid var(--border)', paddingLeft: '1rem', paddingTop: '0.5rem', paddingBottom: '0.5rem', position: 'relative' }}>
            {/* Connector dot */}
            <div style={{
                position: 'absolute', left: '-0.5rem', top: '1rem',
                width: '0.75rem', height: '0.75rem', borderRadius: '50%',
                background: statusStyle.color, border: '2px solid var(--background)',
            }} />

            <Card style={{ padding: '0.75rem' }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                        🤖 {agentName}
                    </span>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        {delegation.revision_count > 0 && (
                            <span style={{
                                fontSize: '0.675rem', padding: '0.125rem 0.375rem',
                                borderRadius: '9999px', border: '1px solid var(--border)',
                            }}>
                                Rev {delegation.revision_count}
                            </span>
                        )}
                        <span style={{
                            fontSize: '0.675rem', padding: '0.125rem 0.375rem',
                            borderRadius: '9999px', background: statusStyle.color + '20',
                            color: statusStyle.color, fontWeight: 500,
                        }}>
                            {statusStyle.label}
                        </span>
                    </div>
                </div>

                {/* Instruction */}
                <div style={{ marginBottom: '0.5rem' }}>
                    <p style={{ fontSize: '0.675rem', fontWeight: 500, color: 'var(--muted-foreground)' }}>Instruction</p>
                    <p style={{ fontSize: '0.8125rem' }}>{delegation.instruction}</p>
                </div>

                {/* Worker output */}
                {delegation.worker_output && (
                    <div style={{ marginBottom: '0.5rem' }}>
                        <p style={{ fontSize: '0.675rem', fontWeight: 500, color: 'var(--muted-foreground)' }}>Output</p>
                        <pre style={{
                            fontSize: '0.75rem', whiteSpace: 'pre-wrap', maxHeight: '10rem',
                            overflowY: 'auto', borderRadius: '0.375rem',
                            background: 'var(--muted)', padding: '0.5rem',
                        }}>
                            {delegation.worker_output.substring(0, 1000)}
                            {delegation.worker_output.length > 1000 && '...'}
                        </pre>
                    </div>
                )}

                {/* Revision feedback */}
                {delegation.revision_feedback && (
                    <div style={{
                        borderLeft: '2px solid #f59e0b', background: 'rgba(245,158,11,0.1)',
                        padding: '0.375rem 0.5rem', borderRadius: '0.25rem', marginBottom: '0.5rem',
                    }}>
                        <p style={{ fontSize: '0.675rem', fontWeight: 500, color: '#f59e0b' }}>Revision Feedback</p>
                        <p style={{ fontSize: '0.75rem' }}>{delegation.revision_feedback}</p>
                    </div>
                )}

                {/* Quality score */}
                {delegation.quality_score !== null && (
                    <span style={{
                        fontSize: '0.675rem', padding: '0.125rem 0.375rem',
                        borderRadius: '9999px', border: '1px solid var(--border)',
                    }}>
                        Quality: {Math.round(delegation.quality_score * 100)}%
                    </span>
                )}
            </Card>
        </div>
    )
}

export function DelegationTree({ teamRunId, brainAgentId, agents }: DelegationTreeProps) {
    const { delegations, isLoading } = useDelegations(teamRunId)

    const agentMap = new Map<string, string>()
    const brainAgentName = agents.find((a) => a.id === brainAgentId)?.name ?? 'Brain Agent'
    agents.forEach((a) => agentMap.set(a.id, a.name))

    if (isLoading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem', fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>
                Loading delegation tree...
            </div>
        )
    }

    if (delegations.length === 0) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2rem', fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>
                <span style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🧠</span>
                No delegations yet — brain is analyzing the task...
            </div>
        )
    }

    return (
        <div>
            {/* Brain agent root */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0' }}>
                <span style={{
                    width: '1.5rem', height: '1.5rem', borderRadius: '50%',
                    background: 'rgba(168,85,247,0.2)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem',
                }}>
                    🧠
                </span>
                <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{brainAgentName}</span>
                <span style={{
                    fontSize: '0.675rem', padding: '0.125rem 0.375rem',
                    borderRadius: '9999px', border: '1px solid var(--border)',
                }}>
                    {delegations.length} delegation{delegations.length !== 1 ? 's' : ''}
                </span>
            </div>

            {/* Delegation nodes */}
            {delegations.map((delegation) => (
                <DelegationNode
                    key={delegation.id}
                    delegation={delegation}
                    agentName={agentMap.get(delegation.worker_agent_id) ?? 'Unknown Agent'}
                />
            ))}
        </div>
    )
}
