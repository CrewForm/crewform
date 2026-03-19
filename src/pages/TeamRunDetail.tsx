// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
    ArrowLeft,
    Clock,
    Coins,
    Hash,
    AlertCircle,
    CheckCircle2,
    XCircle,
    Loader2,
    Bot,
    Cog,
    Brain,
    GitBranch,
    Wrench,
    ChevronDown,
    ChevronRight,
} from 'lucide-react'
import { useTeamRun } from '@/hooks/useTeamRun'
import { useTeam } from '@/hooks/useTeam'
import { useAgents } from '@/hooks/useAgents'
import { useWorkspace } from '@/hooks/useWorkspace'
import { useTeamRunAttachments } from '@/hooks/useAttachments'
import { PipelineProgressRail } from '@/components/teams/PipelineProgressRail'
import { DelegationTree } from '@/components/teams/DelegationTree'
import { CollaborationChatView } from '@/components/teams/CollaborationChatView'
import { FileAttachmentsList } from '@/components/shared/FileAttachmentsList'
import { MarkdownContent } from '@/components/shared/MarkdownContent'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { PipelineConfig, OrchestratorConfig, TeamMessage } from '@/types'

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
    pending: { label: 'Pending', className: 'bg-gray-500/10 text-gray-400 border-gray-500/30' },
    running: { label: 'Running', className: 'bg-blue-500/10 text-blue-400 border-blue-500/30 animate-pulse' },
    paused: { label: 'Paused', className: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30' },
    completed: { label: 'Completed', className: 'bg-green-500/10 text-green-400 border-green-500/30' },
    failed: { label: 'Failed', className: 'bg-red-500/10 text-red-400 border-red-500/30' },
    cancelled: { label: 'Cancelled', className: 'bg-gray-500/10 text-gray-500 border-gray-500/20' },
}

const MESSAGE_ICON: Record<string, typeof Bot> = {
    delegation: Cog,
    result: Bot,
    system: AlertCircle,
    handoff: ArrowLeft,
    brain: Brain,
    worker_result: Bot,
    revision_request: GitBranch,
    accepted: CheckCircle2,
    discussion: Bot,
}

/**
 * Team run detail page.
 * Detects team mode (pipeline vs orchestrator) and shows appropriate progress display.
 * Real-time updates via useTeamRun (Supabase Realtime).
 */
export function TeamRunDetail() {
    const { teamId, runId } = useParams<{ teamId: string; runId: string }>()
    const navigate = useNavigate()
    const { workspaceId } = useWorkspace()
    const { team } = useTeam(teamId ?? null)
    const { agents } = useAgents(workspaceId)
    const { run, messages, isLoading, error } = useTeamRun(runId ?? null)
    const { data: attachments } = useTeamRunAttachments(runId ?? undefined)

    const isOrchestrator = team?.mode === 'orchestrator'
    const isCollaboration = team?.mode === 'collaboration'
    const config = team?.config as PipelineConfig | OrchestratorConfig | undefined
    const steps = (!isOrchestrator && !isCollaboration && config ? (config as PipelineConfig).steps : undefined) ?? []
    const orchConfig = isOrchestrator ? (config as OrchestratorConfig) : null
    const badge = run ? STATUS_BADGE[run.status] : null

    const elapsed = run?.started_at
        ? getElapsed(run.started_at, run.completed_at ?? new Date().toISOString())
        : '—'

    const discussionTurns = isCollaboration
        ? messages.filter((m) => m.message_type === 'discussion').length
        : 0

    const runTitle = isCollaboration ? 'Collaboration Run' : isOrchestrator ? 'Orchestrator Run' : 'Pipeline Run'

    return (
        <div className="p-6 lg:p-8">
            {/* Back */}
            <button
                type="button"
                onClick={() => navigate(`/teams/${teamId ?? ''}`)}
                className="mb-4 flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-300"
            >
                <ArrowLeft className="h-4 w-4" />
                Back to {team?.name ?? 'Team'}
            </button>

            {/* Loading */}
            {isLoading && (
                <div className="space-y-4">
                    <Skeleton className="h-10 w-1/2" />
                    <div className="grid grid-cols-3 gap-4">
                        <Skeleton className="h-64" />
                        <Skeleton className="col-span-2 h-64" />
                    </div>
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="flex flex-col items-center justify-center py-16">
                    <AlertCircle className="mb-3 h-8 w-8 text-red-400" />
                    <p className="text-sm text-gray-400">Failed to load run</p>
                </div>
            )}

            {run && (
                <>
                    {/* Header */}
                    <div className="mb-6">
                        <div className="flex items-center gap-3 mb-2">
                            <h1 className="text-xl font-semibold text-gray-100">{runTitle}</h1>
                            {badge && (
                                <span className={cn(
                                    'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
                                    badge.className,
                                )}>
                                    {badge.label}
                                </span>
                            )}
                        </div>

                        {/* Stats row */}
                        <div className="flex items-center gap-6 text-xs text-gray-500">
                            <span className="flex items-center gap-1.5">
                                <Clock className="h-3.5 w-3.5" />
                                {elapsed}
                            </span>
                            {!isOrchestrator && !isCollaboration && (
                                <span className="flex items-center gap-1.5">
                                    <Hash className="h-3.5 w-3.5" />
                                    Step {run.current_step_idx !== null ? run.current_step_idx + 1 : 0} of {steps.length}
                                </span>
                            )}
                            {isCollaboration && (
                                <span className="flex items-center gap-1.5">
                                    <Hash className="h-3.5 w-3.5" />
                                    {discussionTurns} turn{discussionTurns !== 1 ? 's' : ''}
                                </span>
                            )}
                            {isOrchestrator && run.delegation_depth != null && run.delegation_depth > 0 && (
                                <span className="flex items-center gap-1.5">
                                    <GitBranch className="h-3.5 w-3.5" />
                                    {run.delegation_depth} loop{run.delegation_depth !== 1 ? 's' : ''}
                                </span>
                            )}
                            {run.tokens_total > 0 && (
                                <span className="flex items-center gap-1.5">
                                    {run.tokens_total.toLocaleString()} tokens
                                </span>
                            )}
                            {run.cost_estimate_usd > 0 && (
                                <span className="flex items-center gap-1.5">
                                    <Coins className="h-3.5 w-3.5" />
                                    ${run.cost_estimate_usd.toFixed(4)}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Input task */}
                    <div className="mb-6 rounded-lg border border-border bg-surface-card p-4">
                        <p className="mb-1 text-xs font-medium uppercase tracking-wider text-gray-500">Input Task</p>
                        <p className="text-sm text-gray-300 whitespace-pre-wrap">{run.input_task}</p>
                    </div>

                    {/* Main content: progress + activity timeline */}
                    <div className={cn(
                        'grid gap-6',
                        isOrchestrator || isCollaboration ? 'lg:grid-cols-1' : 'lg:grid-cols-[240px_1fr]',
                    )}>
                        {/* Left: Progress rail (pipeline), Delegation tree (orchestrator), or Chat (collaboration) */}
                        {isCollaboration ? (
                            <CollaborationChatView
                                messages={messages}
                                isLive={run.status === 'running'}
                            />
                        ) : isOrchestrator && orchConfig ? (
                            <div className="rounded-lg border border-border bg-surface-card p-4">
                                <h3 className="mb-4 text-xs font-medium uppercase tracking-wider text-gray-500">Delegation Tree</h3>
                                <DelegationTree
                                    teamRunId={run.id}
                                    brainAgentId={orchConfig.brain_agent_id}
                                    agents={agents}
                                />
                            </div>
                        ) : (
                            <div className="rounded-lg border border-border bg-surface-card p-4">
                                <h3 className="mb-4 text-xs font-medium uppercase tracking-wider text-gray-500">Progress</h3>
                                <PipelineProgressRail
                                    steps={steps}
                                    currentStepIdx={run.current_step_idx}
                                    runStatus={run.status}
                                    agents={agents}
                                />
                            </div>
                        )}

                        {/* Activity timeline + output (skip timeline for collaboration — chat view covers it) */}
                        <div className="space-y-4">
                            {/* Activity timeline (pipeline/orchestrator only — collaboration uses chat view above) */}
                            {!isCollaboration && (
                                <div className="rounded-lg border border-border bg-surface-card p-4">
                                    <h3 className="mb-4 text-xs font-medium uppercase tracking-wider text-gray-500">
                                        Activity ({messages.length})
                                    </h3>
                                    {messages.length > 0 ? (
                                        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                                            {messages.map((msg) => (
                                                <MessageCard key={msg.id} message={msg} agents={agents} />
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-xs text-gray-600">No activity yet...</p>
                                    )}
                                </div>
                            )}

                            {/* Output */}
                            {run.status === 'completed' && run.output && (
                                <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-4">
                                    <div className="flex items-center gap-2 mb-3">
                                        <CheckCircle2 className="h-4 w-4 text-green-400" />
                                        <h3 className="text-sm font-medium text-green-400">Final Output</h3>
                                    </div>
                                    <MarkdownContent content={typeof run.output === 'string' ? run.output : JSON.stringify(run.output, null, 2)} />
                                </div>
                            )}

                            {/* Error */}
                            {run.status === 'failed' && run.error_message && (
                                <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <XCircle className="h-4 w-4 text-red-400" />
                                        <h3 className="text-sm font-medium text-red-400">Error</h3>
                                    </div>
                                    <p className="text-sm text-red-300">{run.error_message}</p>
                                </div>
                            )}

                            {/* Running indicator */}
                            {run.status === 'running' && (
                                <div className="flex items-center gap-3 rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
                                    <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
                                    <div>
                                        <p className="text-sm font-medium text-blue-400">Running</p>
                                        <p className="text-xs text-gray-500">
                                            {isCollaboration
                                                ? 'Agents are discussing. Updates appear in real-time.'
                                                : isOrchestrator
                                                    ? 'Orchestrator is delegating to workers. Updates appear in real-time.'
                                                    : 'Pipeline is executing. Updates appear in real-time.'}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Attachments */}
                            {attachments && attachments.length > 0 && (
                                <div>
                                    <h3 className="text-sm font-medium text-gray-400 mb-2">Files</h3>
                                    <FileAttachmentsList
                                        attachments={attachments}
                                        canDelete
                                        queryKey={['attachments', 'team_run', runId]}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}

// ─── Message Card (activity timeline item) ──────────────────────────────────

interface MessageCardProps {
    message: TeamMessage
    agents: Array<{ id: string; name: string }>
}

function MessageCard({ message, agents }: MessageCardProps) {
    const Icon = MESSAGE_ICON[message.message_type] ?? Bot
    const sender = message.sender_agent_id
        ? agents.find((a) => a.id === message.sender_agent_id)?.name ?? 'Agent'
        : 'System'

    const isResult = message.message_type === 'result'
    const isSystem = message.message_type === 'system'

    return (
        <div className={cn(
            'rounded-lg border p-3 text-sm',
            isResult ? 'border-green-500/20 bg-green-500/5' :
                isSystem ? 'border-gray-700 bg-gray-800/50' :
                    'border-border bg-surface-elevated/50',
        )}>
            <div className="flex items-center gap-2 mb-1.5">
                <Icon className={cn(
                    'h-3.5 w-3.5',
                    isResult ? 'text-green-400' :
                        isSystem ? 'text-gray-500' :
                            'text-blue-400',
                )} />
                <span className="text-xs font-medium text-gray-400">{sender}</span>
                {message.step_idx !== null && (
                    <span className="text-[10px] text-gray-600">Step {message.step_idx + 1}</span>
                )}
                <span className="ml-auto text-[10px] text-gray-600">
                    {new Date(message.created_at).toLocaleTimeString()}
                </span>
            </div>
            <MarkdownContent content={message.content} />
            {/* Tool calls from metadata */}
            {(() => {
                const meta = message.metadata as Record<string, unknown> | null
                const toolCalls = Array.isArray(meta?.tool_calls) ? meta.tool_calls as { tool: string; arguments: Record<string, unknown>; result: string; success: boolean; duration_ms: number }[] : []
                if (toolCalls.length === 0) return null
                return (
                    <div className="mt-3 border-t border-border pt-2">
                        <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-gray-500">
                            <Wrench className="h-3 w-3" />
                            Tool Calls ({toolCalls.length})
                        </p>
                        <div className="space-y-1.5">
                            {toolCalls.map((tc, i) => (
                                <ToolCallRow key={i} call={tc} />
                            ))}
                        </div>
                    </div>
                )
            })()}
            {message.tokens_used > 0 && (
                <p className="mt-1 text-[10px] text-gray-600">
                    {message.tokens_used.toLocaleString()} tokens
                </p>
            )}
        </div>
    )
}

// ─── Tool Call Row (reused pattern from TaskDetailPanel) ────────────────────

function ToolCallRow({ call }: { call: { tool: string; arguments: Record<string, unknown>; result: string; success: boolean; duration_ms: number } }) {
    const [expanded, setExpanded] = useState(false)

    return (
        <div className="rounded border border-border bg-surface-primary">
            <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="flex w-full items-center gap-1.5 px-2 py-1 text-left text-xs transition-colors hover:bg-surface-elevated"
            >
                {expanded ? <ChevronDown className="h-3 w-3 text-gray-500" /> : <ChevronRight className="h-3 w-3 text-gray-500" />}
                {call.success
                    ? <CheckCircle2 className="h-3 w-3 text-green-400" />
                    : <XCircle className="h-3 w-3 text-red-400" />
                }
                <span className="font-mono text-[11px] text-gray-300">{call.tool}</span>
                <span className="ml-auto rounded bg-surface-elevated px-1 py-0.5 text-[9px] text-gray-500">
                    {call.duration_ms}ms
                </span>
            </button>
            {expanded && (
                <div className="border-t border-border px-2 py-1.5 space-y-1.5">
                    <div>
                        <p className="text-[9px] font-medium uppercase tracking-wider text-gray-500 mb-0.5">Arguments</p>
                        <pre className="rounded bg-surface-card p-1.5 text-[10px] text-gray-400 overflow-x-auto">
                            {JSON.stringify(call.arguments, null, 2)}
                        </pre>
                    </div>
                    <div>
                        <p className="text-[9px] font-medium uppercase tracking-wider text-gray-500 mb-0.5">Result</p>
                        <pre className="rounded bg-surface-card p-1.5 text-[10px] text-gray-400 overflow-x-auto whitespace-pre-wrap">
                            {call.result}
                        </pre>
                    </div>
                </div>
            )}
        </div>
    )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getElapsed(start: string, end: string): string {
    const seconds = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000)
    if (seconds < 60) return `${seconds}s`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
}
