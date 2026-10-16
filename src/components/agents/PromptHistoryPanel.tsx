// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { useState } from 'react'
import { History, RotateCcw, Loader2, FileText } from 'lucide-react'
import { usePromptHistory } from '@/hooks/usePromptHistory'
import type { PromptVersion } from '@/db/promptHistory'
import { cn } from '@/lib/utils'

// ─── Main Component ─────────────────────────────────────────────────────────

export function PromptHistoryPanel({
    agentId,
    currentPrompt,
    onRestore,
}: {
    agentId: string
    currentPrompt: string
    onRestore: (prompt: string) => void
}) {
    const { data: versions, isLoading } = usePromptHistory(agentId)
    const [selectedVersion, setSelectedVersion] = useState<PromptVersion | null>(null)

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
            </div>
        )
    }

    if (!versions || versions.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-surface-card py-16">
                <History className="mb-4 h-10 w-10 text-gray-600" />
                <h3 className="mb-1 text-lg font-medium text-gray-300">No version history</h3>
                <p className="text-sm text-gray-500">
                    Prompt versions are saved automatically when you edit and save the system prompt.
                </p>
            </div>
        )
    }

    return (
        <div className="mx-auto max-w-2xl space-y-4">
            {/* Version list */}
            <div className="rounded-lg border border-border bg-surface-card">
                <div className="border-b border-border px-4 py-3">
                    <h3 className="text-sm font-medium text-gray-300">
                        {versions.length} version{versions.length !== 1 ? 's' : ''}
                    </h3>
                </div>
                <div className="max-h-64 overflow-y-auto divide-y divide-border/50">
                    {versions.map((v) => (
                        <button
                            key={v.id}
                            type="button"
                            onClick={() => setSelectedVersion(
                                selectedVersion?.id === v.id ? null : v,
                            )}
                            className={cn(
                                'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors',
                                selectedVersion?.id === v.id
                                    ? 'bg-brand-primary/10'
                                    : 'hover:bg-surface-raised',
                            )}
                        >
                            <div className={cn(
                                'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold',
                                selectedVersion?.id === v.id
                                    ? 'bg-brand-primary/20 text-brand-primary'
                                    : 'bg-surface-raised text-gray-500',
                            )}>
                                v{v.version}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm text-gray-300">
                                    {v.system_prompt.substring(0, 80)}{v.system_prompt.length > 80 ? '…' : ''}
                                </p>
                                <p className="mt-0.5 text-xs text-gray-600">
                                    {new Date(v.changed_at).toLocaleString()}
                                    {v.model && ` · ${v.model}`}
                                    {v.temperature != null && ` · temp ${v.temperature}`}
                                </p>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Diff viewer */}
            {selectedVersion && (
                <div className="rounded-lg border border-border bg-surface-card">
                    <div className="flex items-center justify-between border-b border-border px-4 py-3">
                        <h3 className="text-sm font-medium text-gray-300">
                            Version {selectedVersion.version} vs Current
                        </h3>
                        <button
                            type="button"
                            onClick={() => onRestore(selectedVersion.system_prompt)}
                            className="flex items-center gap-1.5 rounded-lg bg-brand-primary/10 px-3 py-1.5 text-xs font-medium text-brand-primary transition-colors hover:bg-brand-primary/20"
                        >
                            <RotateCcw className="h-3.5 w-3.5" />
                            Restore this version
                        </button>
                    </div>
                    <div className="p-4">
                        <DiffView
                            oldText={selectedVersion.system_prompt}
                            newText={currentPrompt}
                        />
                    </div>
                </div>
            )}
        </div>
    )
}

// ─── Diff Viewer ────────────────────────────────────────────────────────────

function DiffView({ oldText, newText }: { oldText: string; newText: string }) {
    const oldLines = oldText.split('\n')
    const newLines = newText.split('\n')
    const diff = computeSimpleDiff(oldLines, newLines)

    if (diff.length === 0) {
        return (
            <div className="flex items-center gap-2 text-sm text-gray-500">
                <FileText className="h-4 w-4" />
                No differences — this version is identical to the current prompt.
            </div>
        )
    }

    return (
        <div className="max-h-80 overflow-y-auto rounded-lg bg-surface-raised font-mono text-xs">
            {diff.map((line, i) => (
                <div
                    key={i}
                    className={cn(
                        'px-3 py-0.5 whitespace-pre-wrap break-words',
                        line.type === 'removed' && 'bg-red-500/10 text-red-400',
                        line.type === 'added' && 'bg-green-500/10 text-green-400',
                        line.type === 'unchanged' && 'text-gray-500',
                    )}
                >
                    <span className="mr-2 inline-block w-4 select-none text-right opacity-50">
                        {line.type === 'removed' ? '−' : line.type === 'added' ? '+' : ' '}
                    </span>
                    {line.text}
                </div>
            ))}
        </div>
    )
}

// ─── Simple line diff ───────────────────────────────────────────────────────

interface DiffLine {
    type: 'added' | 'removed' | 'unchanged'
    text: string
}

/**
 * Simple LCS-based line diff. Good enough for prompt comparisons.
 */
function computeSimpleDiff(oldLines: string[], newLines: string[]): DiffLine[] {
    // Build LCS table
    const m = oldLines.length
    const n = newLines.length
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0) as number[])

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (oldLines[i - 1] === newLines[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1
            } else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
            }
        }
    }

    // Backtrack to get diff
    const result: DiffLine[] = []
    let i = m
    let j = n

    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
            result.unshift({ type: 'unchanged', text: oldLines[i - 1] })
            i--
            j--
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            result.unshift({ type: 'added', text: newLines[j - 1] })
            j--
        } else {
            result.unshift({ type: 'removed', text: oldLines[i - 1] })
            i--
        }
    }

    return result
}
