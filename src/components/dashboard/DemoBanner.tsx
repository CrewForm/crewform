// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useState } from 'react'
import { Bot, Sparkles, Trash2, Loader2, AlertTriangle, X, Key, Play, GitBranch } from 'lucide-react'
import { useDemoWorkspace } from '@/hooks/useDemoWorkspace'
import { useApiKeys } from '@/hooks/useApiKeys'
import { useAuth } from '@/hooks/useAuth'
import { useWorkspace } from '@/hooks/useWorkspace'
import { useCreateTeamRun } from '@/hooks/useCreateTeamRun'
import { useNavigate } from 'react-router-dom'

const GOLDEN_PATH_PROMPT = `Research the market for AI customer support tools and produce a short executive brief.

Focus on:
- buyer pains and adoption drivers
- major solution categories
- opportunities for a self-hostable, interoperable agent platform
- risks and assumptions we should validate next

Write the final brief for a product and go-to-market team.`

/**
 * Dashboard banner for activating or removing the demo workspace.
 *
 * Two states:
 * - Not seeded: CTA card to activate demo (5 agents + 1 pipeline team)
 * - Seeded: Subtle banner showing demo is active + remove button
 */
export function DemoBanner() {
    const {
        isDemoSeeded,
        isDemoDismissed,
        demoTeamId,
        seedDemo,
        removeDemo,
        isSeeding,
        isRemoving,
    } = useDemoWorkspace()
    const { workspaceId } = useWorkspace()
    const { user } = useAuth()
    const { keys, isLoading: isLoadingKeys } = useApiKeys(workspaceId)
    const createRun = useCreateTeamRun()
    const navigate = useNavigate()

    const [showConfirmRemove, setShowConfirmRemove] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [dismissed, setDismissed] = useState(isDemoDismissed)

    if (dismissed && !isDemoSeeded) return null

    const handleSeed = async () => {
        setError(null)
        try {
            await seedDemo()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to seed demo workspace')
        }
    }

    const hasOpenAiKey = keys.some(
        (key) => key.provider.toLowerCase() === 'openai' && key.is_active && key.is_valid,
    )

    const handleRunDemo = async () => {
        setError(null)

        if (!hasOpenAiKey) {
            navigate('/settings')
            return
        }

        if (!workspaceId || !user?.id || !demoTeamId) {
            setError('Demo team is not ready yet. Try refreshing the page.')
            return
        }

        try {
            const run = await createRun.mutateAsync({
                team_id: demoTeamId,
                workspace_id: workspaceId,
                input_task: GOLDEN_PATH_PROMPT,
                created_by: user.id,
            })
            navigate(`/teams/${demoTeamId}/runs/${run.id}`)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to start the demo run')
        }
    }

    const handleRemove = async () => {
        setError(null)
        try {
            await removeDemo()
            setShowConfirmRemove(false)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to remove demo data')
        }
    }

    // ─── Seeded state: subtle info banner ────────────────────────────────────
    if (isDemoSeeded) {
        return (
            <div className="mb-6">
                {/* Remove confirmation dialog */}
                {showConfirmRemove && (
                    <div className="mb-3 rounded-xl border border-red-500/30 bg-red-500/5 p-4">
                        <div className="flex items-start gap-3">
                            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
                            <div className="flex-1">
                                <p className="text-sm font-medium text-gray-200">Remove all demo data?</p>
                                <p className="mt-1 text-xs text-gray-400">
                                    This will permanently delete 5 demo agents and the Research Brief Pipeline team.
                                    Your own agents and data will not be affected.
                                </p>
                                <div className="mt-3 flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => void handleRemove()}
                                        disabled={isRemoving}
                                        className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/20 px-3 py-1.5 text-xs font-medium text-red-300 transition-colors hover:bg-red-500/30 disabled:opacity-50"
                                    >
                                        {isRemoving ? (
                                            <Loader2 className="h-3 w-3 animate-spin" />
                                        ) : (
                                            <Trash2 className="h-3 w-3" />
                                        )}
                                        {isRemoving ? 'Removing…' : 'Yes, remove demo data'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setShowConfirmRemove(false)}
                                        disabled={isRemoving}
                                        className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-400 transition-colors hover:text-gray-200"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Active demo banner */}
                <div className="flex items-center justify-between rounded-xl border border-brand-primary/20 bg-brand-primary/5 px-5 py-3">
                    <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-primary/10">
                            <Sparkles className="h-4 w-4 text-brand-primary" />
                        </div>
                        <div>
                                <p className="text-sm font-medium text-gray-200">Research Brief demo ready</p>
                                <p className="text-xs text-gray-500">
                                Run a real 3-step pipeline and watch CrewForm create an executive brief.{' '}
                                <button
                                    type="button"
                                    onClick={() => demoTeamId ? navigate(`/teams/${demoTeamId}`) : navigate('/teams')}
                                    className="text-brand-primary hover:underline"
                                >
                                    View team →
                                </button>
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => void handleRunDemo()}
                            disabled={isLoadingKeys || createRun.isPending}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-primary px-3 py-1.5 text-xs font-semibold text-gray-950 transition-colors hover:brightness-110 disabled:opacity-50"
                        >
                            {createRun.isPending ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                            ) : hasOpenAiKey ? (
                                <Play className="h-3 w-3" />
                            ) : (
                                <Key className="h-3 w-3" />
                            )}
                            {createRun.isPending ? 'Starting…' : hasOpenAiKey ? 'Run Demo' : 'Add OpenAI Key'}
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowConfirmRemove(true)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-400 transition-colors hover:border-red-500/30 hover:text-red-400"
                        >
                            <Trash2 className="h-3 w-3" />
                            Remove
                        </button>
                    </div>
                </div>

                {error && (
                    <p className="mt-2 text-xs text-red-400">{error}</p>
                )}
            </div>
        )
    }

    // ─── Not seeded: activation CTA ─────────────────────────────────────────
    return (
        <div className="relative mb-6 overflow-hidden rounded-xl border border-border bg-surface-card">
            {/* Dismiss button */}
            <button
                type="button"
                onClick={() => setDismissed(true)}
                className="absolute right-3 top-3 rounded-lg p-1 text-gray-600 transition-colors hover:text-gray-400"
                title="Dismiss"
            >
                <X className="h-4 w-4" />
            </button>

            {/* Subtle glow */}
            <div className="pointer-events-none absolute -right-20 -top-20 h-60 w-60 rounded-full bg-brand-primary/5 blur-3xl" />

            <div className="relative p-6">
                <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-primary/20 to-brand-primary/5 ring-1 ring-brand-primary/20">
                        <Sparkles className="h-6 w-6 text-brand-primary" />
                    </div>
                    <div className="flex-1">
                        <h3 className="text-base font-semibold text-gray-100">
                            Run your first agent system
                        </h3>
                        <p className="mt-1 text-sm text-gray-400 leading-relaxed">
                            Set up a golden-path Research Brief Pipeline with pre-configured agents.
                            Add one OpenAI key, run a real team workflow, then inspect the live run and output.
                            You can{' '}
                            <button
                                type="button"
                                onClick={() => navigate('/settings')}
                                className="inline-flex items-center gap-1 text-brand-primary hover:underline"
                            >
                                <Key className="h-3 w-3" />
                                add your API key first
                            </button>
                            {' '}or set up the demo now.
                        </p>

                        {/* What you get */}
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-gray-900/50 px-3 py-2">
                                <Bot className="h-4 w-4 text-blue-400" />
                                <div>
                                    <p className="text-xs font-medium text-gray-300">5 AI Agents</p>
                                    <p className="text-[11px] text-gray-500">Research, Analysis, Writing, Code, Email</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-gray-900/50 px-3 py-2">
                                <GitBranch className="h-4 w-4 text-green-400" />
                                <div>
                                    <p className="text-xs font-medium text-gray-300">Research Brief Pipeline</p>
                                    <p className="text-[11px] text-gray-500">Research → Analyze → Write Brief</p>
                                </div>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="mt-4 flex items-center gap-3">
                            <button
                                type="button"
                                onClick={() => void handleSeed()}
                                disabled={isSeeding}
                                className="inline-flex items-center gap-2 rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-gray-950 transition-all hover:brightness-110 disabled:opacity-50"
                            >
                                {isSeeding ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Sparkles className="h-4 w-4" />
                                )}
                                {isSeeding ? 'Setting up…' : 'Activate Demo Workspace'}
                            </button>
                            <span className="text-xs text-gray-600">
                                Creates real agents and a real team, removable anytime
                            </span>
                        </div>

                        {error && (
                            <p className="mt-2 text-xs text-red-400">{error}</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
