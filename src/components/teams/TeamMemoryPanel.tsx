// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useState } from 'react'
import {
    Brain, Loader2, Trash2, Search, ChevronDown, ChevronUp, ExternalLink,
} from 'lucide-react'
import { useTeamMemories, useDeleteTeamMemory } from '@/hooks/useTeamMemory'
import type { TeamMemoryEntry } from '@/db/teamMemory'
import { cn } from '@/lib/utils'

export function TeamMemoryPanel({ teamId }: { teamId: string }) {
    const { data: memories, isLoading } = useTeamMemories(teamId)
    const deleteMutation = useDeleteTeamMemory()
    const [search, setSearch] = useState('')
    const [expanded, setExpanded] = useState(true)
    const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set())

    const filteredMemories = (memories ?? []).filter((m) =>
        search === '' || m.content.toLowerCase().includes(search.toLowerCase()),
    )

    function toggleCard(id: string) {
        setExpandedCards((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    function handleDelete(memory: TeamMemoryEntry) {
        if (!confirm('Delete this memory entry? This cannot be undone.')) return
        deleteMutation.mutate({ memoryId: memory.id, teamId })
    }

    return (
        <div className="rounded-lg border border-border bg-surface-card">
            {/* Header */}
            <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-surface-raised/50"
            >
                <Brain className="h-5 w-5 text-purple-400" />
                <div className="flex-1">
                    <h3 className="text-sm font-medium text-gray-200">Knowledge Base</h3>
                    <p className="text-xs text-gray-500">
                        {isLoading ? 'Loading…' : `${memories?.length ?? 0} memories stored`}
                    </p>
                </div>
                {expanded ? (
                    <ChevronUp className="h-4 w-4 text-gray-500" />
                ) : (
                    <ChevronDown className="h-4 w-4 text-gray-500" />
                )}
            </button>

            {expanded && (
                <div className="border-t border-border">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
                        </div>
                    ) : !memories || memories.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12">
                            <Brain className="mb-3 h-8 w-8 text-gray-700" />
                            <p className="text-sm text-gray-500">No memories yet</p>
                            <p className="mt-1 text-xs text-gray-600">
                                Memories are created automatically when team runs complete.
                            </p>
                        </div>
                    ) : (
                        <>
                            {/* Search */}
                            <div className="border-b border-border/50 px-4 py-3">
                                <div className="relative">
                                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
                                    <input
                                        type="text"
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        placeholder="Search memories…"
                                        className="w-full rounded-lg border border-border bg-surface-raised py-1.5 pl-8 pr-3 text-xs text-gray-300 placeholder-gray-600 outline-none transition-colors focus:border-brand-primary/50"
                                    />
                                </div>
                            </div>

                            {/* Memory cards */}
                            <div className="max-h-96 overflow-y-auto divide-y divide-border/30">
                                {filteredMemories.length === 0 ? (
                                    <div className="px-4 py-8 text-center text-xs text-gray-500">
                                        No memories match your search.
                                    </div>
                                ) : (
                                    filteredMemories.map((memory) => {
                                        const isCardExpanded = expandedCards.has(memory.id)
                                        const preview = memory.content.length > 150
                                            ? `${memory.content.slice(0, 150)}…`
                                            : memory.content

                                        return (
                                            <div key={memory.id} className="px-4 py-3">
                                                <div className="flex items-start gap-2">
                                                    <div className="min-w-0 flex-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleCard(memory.id)}
                                                            className="block w-full text-left"
                                                        >
                                                            <p className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap">
                                                                {isCardExpanded ? memory.content : preview}
                                                            </p>
                                                        </button>
                                                        <div className="mt-1.5 flex items-center gap-3 text-[10px] text-gray-600">
                                                            <span>{new Date(memory.created_at).toLocaleString()}</span>
                                                            {memory.run_id && (
                                                                <a
                                                                    href={`/teams/${teamId}/runs/${memory.run_id}`}
                                                                    className="flex items-center gap-0.5 text-brand-primary/70 hover:text-brand-primary"
                                                                >
                                                                    <ExternalLink className="h-2.5 w-2.5" />
                                                                    Source run
                                                                </a>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDelete(memory)}
                                                        disabled={deleteMutation.isPending}
                                                        className={cn(
                                                            'mt-0.5 shrink-0 rounded-md p-1 text-gray-600 transition-colors',
                                                            'hover:bg-red-500/10 hover:text-red-400',
                                                            'disabled:opacity-50',
                                                        )}
                                                        title="Delete memory"
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        )
                                    })
                                )}
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    )
}
