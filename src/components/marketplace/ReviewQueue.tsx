// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useState, useEffect, useCallback } from 'react'
import {
    Loader2, CheckCircle2, XCircle, ShieldCheck, ShieldAlert, PackageOpen,
    ChevronDown, ChevronUp, Bot, Cpu, Thermometer, Wrench, Tag,
    Play, Trash2, AlertTriangle, Copy,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { useWorkspace } from '@/hooks/useWorkspace'
import { usePendingSubmissions, useApproveSubmission, useRejectSubmission, useMarketplaceAgents } from '@/hooks/useMarketplace'
import { createTask } from '@/db/tasks'
import { deleteTask } from '@/db/tasks'
import { supabase } from '@/lib/supabase'
import { findDuplicateAgents } from '@/lib/similarity'
import { cn } from '@/lib/utils'
import type { Task } from '@/types'
import type { DuplicateMatch } from '@/lib/similarity'

/**
 * Admin review queue for marketplace agent submissions.
 * Includes expandable agent detail view for thorough review before approving.
 */
export function ReviewQueue() {
    const { user } = useAuth()
    const { workspaceId } = useWorkspace()
    const { data: submissions, isLoading } = usePendingSubmissions()
    const { agents: publishedAgents } = useMarketplaceAgents({})
    const approveMutation = useApproveSubmission()
    const rejectMutation = useRejectSubmission()
    const [rejectingId, setRejectingId] = useState<string | null>(null)
    const [rejectNotes, setRejectNotes] = useState('')
    const [expandedId, setExpandedId] = useState<string | null>(null)

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
            </div>
        )
    }

    if (!submissions || submissions.length === 0) {
        return (
            <div className="rounded-xl border border-border bg-surface-card p-8 text-center">
                <PackageOpen className="mx-auto mb-2 h-10 w-10 text-gray-600" />
                <h3 className="mb-1 text-lg font-medium text-gray-300">No pending submissions</h3>
                <p className="text-sm text-gray-500">All marketplace submissions have been reviewed.</p>
            </div>
        )
    }

    const handleApprove = (id: string) => {
        if (!user) return
        approveMutation.mutate({ id, reviewerId: user.id })
    }

    const handleReject = (id: string) => {
        if (!user || !rejectNotes.trim()) return
        rejectMutation.mutate(
            { id, reviewerId: user.id, notes: rejectNotes },
            {
                onSuccess: () => {
                    setRejectingId(null)
                    setRejectNotes('')
                },
            },
        )
    }

    return (
        <div className="space-y-4">
            <p className="text-xs text-gray-500">
                {submissions.length} pending submission{submissions.length !== 1 ? 's' : ''}
            </p>

            {submissions.map((sub) => {
                const scan = sub.injection_scan_result
                const isRejecting = rejectingId === sub.id
                const isBusy = approveMutation.isPending || rejectMutation.isPending
                const isExpanded = expandedId === sub.id
                const agent = sub.agent_data

                return (
                    <div key={sub.id} className="rounded-xl border border-border bg-surface-card p-4">
                        {/* Agent info */}
                        <div className="mb-3">
                            <p className="text-sm font-medium text-gray-200">
                                {sub.agent_name ?? 'Unknown Agent'}
                            </p>
                            <p className="text-xs text-gray-500">
                                {sub.agent_description ?? 'No description'}
                            </p>
                            <p className="mt-1 text-[10px] text-gray-600">
                                Submitted {new Date(sub.created_at).toLocaleDateString()}
                            </p>
                        </div>

                        {/* Injection scan result */}
                        <div className={cn(
                            'mb-3 flex items-start gap-2 rounded-lg border px-3 py-2',
                            scan.safe
                                ? 'border-green-500/20 bg-green-500/5'
                                : 'border-red-500/20 bg-red-500/5',
                        )}>
                            {scan.safe ? (
                                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-400" />
                            ) : (
                                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
                            )}
                            <div className="flex-1">
                                <p className={cn(
                                    'text-xs font-medium',
                                    scan.safe ? 'text-green-300' : 'text-red-300',
                                )}>
                                    {scan.safe ? 'Scan passed' : 'Flagged'}
                                </p>
                                {scan.flags.length > 0 && (
                                    <ul className="mt-0.5">
                                        {scan.flags.map((flag) => (
                                            <li key={flag} className="text-[10px] text-red-400">• {flag}</li>
                                        ))}
                                    </ul>
                                )}
                                {scan.aiScan && (
                                    <div className="mt-1.5 border-t border-border/50 pt-1.5">
                                        <p className="text-[10px] font-medium text-gray-400">
                                            AI Scan ({Math.round(scan.aiScan.confidence * 100)}% confidence)
                                            {' — '}
                                            <span className={scan.aiScan.safe ? 'text-green-400' : 'text-red-400'}>
                                                {scan.aiScan.safe ? 'Safe' : 'Flagged'}
                                            </span>
                                        </p>
                                        <p className="text-[10px] text-gray-500">{scan.aiScan.reasoning}</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Review Details toggle */}
                        <button
                            type="button"
                            onClick={() => setExpandedId(isExpanded ? null : sub.id)}
                            className="mb-3 flex w-full items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-gray-400 transition-colors hover:bg-surface-elevated hover:text-gray-200"
                        >
                            {isExpanded ? (
                                <ChevronUp className="h-3.5 w-3.5" />
                            ) : (
                                <ChevronDown className="h-3.5 w-3.5" />
                            )}
                            {isExpanded ? 'Hide Details' : 'Review Details'}
                        </button>

                        {/* Expanded agent details */}
                        {isExpanded && agent && (
                            <div className="mb-3 space-y-3 rounded-lg border border-border/50 bg-surface-primary p-4">
                                {/* Model & Provider */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="flex items-center gap-2">
                                        <Cpu className="h-3.5 w-3.5 text-gray-500" />
                                        <div>
                                            <p className="text-[10px] text-gray-500">Model</p>
                                            <p className="text-xs font-medium text-gray-200">{agent.model}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Bot className="h-3.5 w-3.5 text-gray-500" />
                                        <div>
                                            <p className="text-[10px] text-gray-500">Provider</p>
                                            <p className="text-xs font-medium text-gray-200">{agent.provider ?? 'Unknown'}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Temperature */}
                                <div className="flex items-center gap-2">
                                    <Thermometer className="h-3.5 w-3.5 text-gray-500" />
                                    <p className="text-xs text-gray-300">Temperature: <span className="font-mono font-medium">{agent.temperature}</span></p>
                                </div>

                                {/* Tools */}
                                {agent.tools.length > 0 && (
                                    <div>
                                        <div className="mb-1.5 flex items-center gap-1.5">
                                            <Wrench className="h-3.5 w-3.5 text-gray-500" />
                                            <p className="text-[10px] font-medium text-gray-500 uppercase">Tools</p>
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {agent.tools.map((tool) => (
                                                <span key={tool} className="rounded-md bg-surface-elevated px-2 py-0.5 text-[10px] font-medium text-gray-400">
                                                    {tool}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Tags */}
                                {agent.marketplace_tags.length > 0 && (
                                    <div>
                                        <div className="mb-1.5 flex items-center gap-1.5">
                                            <Tag className="h-3.5 w-3.5 text-gray-500" />
                                            <p className="text-[10px] font-medium text-gray-500 uppercase">Tags</p>
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {agent.marketplace_tags.map((tag) => (
                                                <span key={tag} className="rounded-md bg-brand-muted/20 border border-brand-primary/30 px-2 py-0.5 text-[10px] font-medium text-brand-primary">
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* System Prompt (admin-only view) */}
                                <div>
                                    <p className="mb-1.5 text-[10px] font-medium text-gray-500 uppercase">System Prompt</p>
                                    <div className="max-h-48 overflow-y-auto rounded-lg bg-surface-card p-3 text-xs leading-relaxed text-gray-300 font-mono">
                                        {agent.system_prompt}
                                    </div>
                                </div>

                                {/* ─── Duplicate Detection ──────────────────────── */}
                                <DuplicateDetectionPanel
                                    agentName={agent.name}
                                    agentTags={agent.marketplace_tags}
                                    agentId={sub.agent_id}
                                    publishedAgents={publishedAgents}
                                />

                                {/* ─── Test Run ────────────────────────────────── */}
                                <TestRunPanel
                                    agentId={sub.agent_id}
                                    agentName={agent.name}
                                    workspaceId={workspaceId}
                                    userId={user?.id ?? null}
                                />
                            </div>
                        )}

                        {isExpanded && !agent && (
                            <div className="mb-3 rounded-lg border border-border/50 bg-surface-primary p-4 text-center">
                                <p className="text-xs text-gray-500">Agent data not available.</p>
                            </div>
                        )}

                        {/* Reject notes form */}
                        {isRejecting && (
                            <div className="mb-3">
                                <textarea
                                    value={rejectNotes}
                                    onChange={(e) => setRejectNotes(e.target.value)}
                                    placeholder="Reason for rejection..."
                                    rows={2}
                                    className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-xs text-gray-200 outline-none focus:border-red-400"
                                />
                            </div>
                        )}

                        {/* Actions */}
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => handleApprove(sub.id)}
                                disabled={isBusy || isRejecting}
                                className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-green-500 disabled:opacity-50"
                            >
                                {approveMutation.isPending ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                    <CheckCircle2 className="h-3 w-3" />
                                )}
                                Approve
                            </button>

                            {isRejecting ? (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => handleReject(sub.id)}
                                        disabled={isBusy || !rejectNotes.trim()}
                                        className="flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-500 disabled:opacity-50"
                                    >
                                        {rejectMutation.isPending ? (
                                            <Loader2 className="h-3 w-3 animate-spin" />
                                        ) : (
                                            <XCircle className="h-3 w-3" />
                                        )}
                                        Confirm Reject
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { setRejectingId(null); setRejectNotes('') }}
                                        className="rounded-lg border border-border px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200"
                                    >
                                        Cancel
                                    </button>
                                </>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => setRejectingId(sub.id)}
                                    disabled={isBusy}
                                    className="flex items-center gap-1 rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                                >
                                    <XCircle className="h-3 w-3" />
                                    Reject
                                </button>
                            )}
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

// ─── Duplicate Detection Panel ──────────────────────────────────────────────

interface DuplicateDetectionPanelProps {
    agentName: string
    agentTags: string[]
    agentId: string
    publishedAgents: Array<{ id: string; name: string; marketplace_tags?: string[]; tags?: string[] }>
}

function DuplicateDetectionPanel({ agentName, agentTags, agentId, publishedAgents }: DuplicateDetectionPanelProps) {
    const duplicates: DuplicateMatch[] = findDuplicateAgents(agentName, agentTags, publishedAgents, agentId)

    if (duplicates.length === 0) return null

    return (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
            <div className="mb-2 flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                <p className="text-xs font-medium text-amber-300">
                    Possible Duplicates ({duplicates.length} found)
                </p>
            </div>
            <div className="space-y-1.5">
                {duplicates.map((dup) => (
                    <div key={dup.id} className="flex items-center justify-between rounded-md bg-surface-card px-2.5 py-1.5">
                        <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-gray-200 truncate">{dup.name}</p>
                            <p className="text-[10px] text-gray-500">
                                Name: {Math.round(dup.nameSimilarity * 100)}%
                                {' · '}Tags: {Math.round(dup.tagSimilarity * 100)}%
                                {' · '}Score: {Math.round(dup.combinedScore * 100)}%
                            </p>
                        </div>
                        <button
                            type="button"
                            className="shrink-0 text-gray-500 hover:text-gray-300"
                            title="Copy agent ID"
                            onClick={() => { void navigator.clipboard.writeText(dup.id); toast.info('Agent ID copied') }}
                        >
                            <Copy className="h-3 w-3" />
                        </button>
                    </div>
                ))}
            </div>
            <p className="mt-2 text-[10px] text-amber-400/70">
                Advisory only — you can still approve this submission.
            </p>
        </div>
    )
}

// ─── Test Run Panel ─────────────────────────────────────────────────────────

interface TestRunPanelProps {
    agentId: string
    agentName: string
    workspaceId: string | null
    userId: string | null
}

function TestRunPanel({ agentId, agentName, workspaceId, userId }: TestRunPanelProps) {
    const [testPrompt, setTestPrompt] = useState('Hello, introduce yourself and explain what you can do.')
    const [testTask, setTestTask] = useState<Task | null>(null)
    const [testResult, setTestResult] = useState<string | null>(null)
    const [testError, setTestError] = useState<string | null>(null)
    const [isRunning, setIsRunning] = useState(false)
    const [cleaning, setCleaning] = useState(false)

    // Subscribe to task updates via Realtime
    useEffect(() => {
        if (!testTask) return

        const channel = supabase
            .channel(`test-run-${testTask.id}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'tasks',
                filter: `id=eq.${testTask.id}`,
            }, (payload) => {
                const updated = payload.new as Task
                setTestTask(updated)

                if (updated.status === 'completed') {
                    const result = updated.result
                    const output = result
                        ? (typeof result === 'object' && 'output' in result
                            ? String(result.output)
                            : JSON.stringify(result, null, 2))
                        : 'No output'
                    setTestResult(output)
                    setIsRunning(false)
                } else if (updated.status === 'failed') {
                    setTestError(updated.error ?? 'Task failed with no error message')
                    setIsRunning(false)
                }
            })
            .subscribe()

        return () => { void supabase.removeChannel(channel) }
    }, [testTask?.id]) // eslint-disable-line react-hooks/exhaustive-deps

    const handleTestRun = useCallback(async () => {
        if (!workspaceId || !userId || !testPrompt.trim()) return

        setIsRunning(true)
        setTestResult(null)
        setTestError(null)

        try {
            const task = await createTask({
                workspace_id: workspaceId,
                title: `[Admin Test] ${agentName}`,
                description: testPrompt.trim(),
                assigned_agent_id: agentId,
                priority: 'low',
                status: 'dispatched',
                created_by: userId,
            })
            setTestTask(task)
        } catch (err) {
            setTestError(err instanceof Error ? err.message : 'Failed to create test task')
            setIsRunning(false)
        }
    }, [workspaceId, userId, testPrompt, agentId, agentName])

    const handleCleanup = useCallback(async () => {
        if (!testTask) return
        setCleaning(true)
        try {
            await deleteTask(testTask.id)
            toast.success('Test task cleaned up')
            setTestTask(null)
            setTestResult(null)
            setTestError(null)
        } catch {
            toast.error('Failed to delete test task')
        } finally {
            setCleaning(false)
        }
    }, [testTask])

    if (!workspaceId || !userId) {
        return (
            <div className="rounded-lg border border-border/50 bg-surface-card p-3 text-center text-xs text-gray-500">
                Test run requires an active workspace.
            </div>
        )
    }

    return (
        <div className="rounded-lg border border-border/50 bg-surface-card p-3">
            <p className="mb-2 text-[10px] font-medium text-gray-500 uppercase">Test Run</p>

            {/* Prompt input */}
            <div className="mb-2">
                <textarea
                    value={testPrompt}
                    onChange={(e) => setTestPrompt(e.target.value)}
                    rows={2}
                    disabled={isRunning}
                    placeholder="Enter a test prompt..."
                    className="w-full rounded-lg border border-border bg-surface-primary px-3 py-2 text-xs text-gray-200 outline-none focus:border-brand-primary disabled:opacity-50"
                />
            </div>

            {/* Run button */}
            <div className="mb-2 flex items-center gap-2">
                <button
                    type="button"
                    onClick={() => void handleTestRun()}
                    disabled={isRunning || !testPrompt.trim()}
                    className="flex items-center gap-1.5 rounded-lg bg-brand-primary px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
                >
                    {isRunning ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                        <Play className="h-3 w-3" />
                    )}
                    {isRunning ? 'Running...' : 'Run Test'}
                </button>

                {testTask && !isRunning && (
                    <button
                        type="button"
                        onClick={() => void handleCleanup()}
                        disabled={cleaning}
                        className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[10px] font-medium text-gray-400 transition-colors hover:bg-surface-elevated hover:text-gray-200 disabled:opacity-50"
                    >
                        <Trash2 className="h-3 w-3" />
                        {cleaning ? 'Cleaning...' : 'Clean Up Task'}
                    </button>
                )}
            </div>

            {/* Status */}
            {isRunning && testTask && (
                <div className="flex items-center gap-2 rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />
                    <p className="text-xs text-blue-300">
                        Task {testTask.status}...
                    </p>
                </div>
            )}

            {/* Result */}
            {testResult && (
                <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3">
                    <p className="mb-1 text-[10px] font-medium text-green-400 uppercase">Result</p>
                    <div className="max-h-48 overflow-y-auto text-xs leading-relaxed text-gray-300 whitespace-pre-wrap font-mono">
                        {testResult}
                    </div>
                </div>
            )}

            {/* Error */}
            {testError && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                    <p className="mb-1 text-[10px] font-medium text-red-400 uppercase">Error</p>
                    <p className="text-xs text-red-300">{testError}</p>
                </div>
            )}
        </div>
    )
}
