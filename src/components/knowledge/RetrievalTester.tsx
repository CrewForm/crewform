// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { useState, useCallback } from 'react'
import { Search, Loader2, FileText, Zap, Database, ChevronDown, ChevronUp } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import type { KnowledgeDocument } from '@/db/knowledgeBase'

// ─── Types ──────────────────────────────────────────────────────────────────

interface SearchResult {
    content: string
    document_name: string
    similarity: number
    chunk_index?: number
    document_id?: string
    vector_similarity?: number
    text_rank?: number
    combined_score?: number
}

interface SearchResponse {
    mode: 'vector' | 'hybrid'
    query: string
    results: SearchResult[]
    count: number
    durationMs: number
}

// ─── Score Badge ────────────────────────────────────────────────────────────

function ScoreBadge({ score, label }: { score: number; label?: string }) {
    const pct = Math.round(score * 100)
    const color =
        pct >= 70 ? 'bg-green-500/10 text-green-400 border-green-500/20' :
        pct >= 50 ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' :
                    'bg-red-500/10 text-red-400 border-red-500/20'

    return (
        <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium', color)}>
            {label ? `${label}: ` : ''}{String(pct)}%
        </span>
    )
}

// ─── Component ──────────────────────────────────────────────────────────────

interface Props {
    documents: KnowledgeDocument[]
    workspaceId: string | null
}

export default function RetrievalTester({ documents, workspaceId }: Props) {
    const { session } = useAuth()
    const [query, setQuery] = useState('')
    const [mode, setMode] = useState<'hybrid' | 'vector'>('hybrid')
    const [topK, setTopK] = useState(5)
    const [selectedDocs, setSelectedDocs] = useState<string[]>([])
    const [selectedTags, setSelectedTags] = useState<string[]>([])
    const [results, setResults] = useState<SearchResponse | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [expandedChunks, setExpandedChunks] = useState<Set<number>>(new Set())
    const [isOpen, setIsOpen] = useState(false)

    // Collect unique tags from all documents
    const allTags = Array.from(new Set(documents.flatMap(d => d.tags)))

    const readyDocs = documents.filter(d => d.status === 'ready')

    const handleSearch = useCallback(async () => {
        if (!query.trim() || !workspaceId || !session?.access_token) return

        setLoading(true)
        setError(null)
        setExpandedChunks(new Set())

        try {
            const taskRunnerUrl = (import.meta.env.VITE_TASK_RUNNER_URL as string | undefined) ?? 'https://runner.crewform.tech'

            const res = await fetch(`${taskRunnerUrl}/kb/search`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({
                    query: query.trim(),
                    documentIds: selectedDocs.length > 0 ? selectedDocs : undefined,
                    tags: selectedTags.length > 0 ? selectedTags : undefined,
                    topK,
                    mode,
                }),
            })

            if (!res.ok) {
                const data = await res.json().catch(() => ({ error: 'Request failed' })) as { error?: string }
                throw new Error(data.error ?? `HTTP ${String(res.status)}`)
            }

            const data = await res.json() as SearchResponse
            setResults(data)
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Search failed'
            setError(msg)
        } finally {
            setLoading(false)
        }
    }, [query, workspaceId, session, selectedDocs, selectedTags, topK, mode])

    const toggleChunk = (idx: number) => {
        setExpandedChunks(prev => {
            const next = new Set(prev)
            if (next.has(idx)) {
                next.delete(idx)
            } else {
                next.add(idx)
            }
            return next
        })
    }

    const toggleDoc = (docId: string) => {
        setSelectedDocs(prev =>
            prev.includes(docId) ? prev.filter(d => d !== docId) : [...prev, docId],
        )
    }

    const toggleTag = (tag: string) => {
        setSelectedTags(prev =>
            prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag],
        )
    }

    return (
        <div className="rounded-xl border border-gray-800 bg-surface-card">
            {/* Header — collapsible */}
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-white/[0.02]"
            >
                <div className="flex items-center gap-2">
                    <Search className="h-4 w-4 text-brand-primary" />
                    <h3 className="text-sm font-semibold text-gray-200">Test Retrieval</h3>
                    <span className="text-xs text-gray-500">Search your documents and see ranked results</span>
                </div>
                {isOpen
                    ? <ChevronUp className="h-4 w-4 text-gray-500" />
                    : <ChevronDown className="h-4 w-4 text-gray-500" />
                }
            </button>

            {isOpen && (
                <div className="border-t border-gray-800 p-4 space-y-4">
                    {/* Controls */}
                    <div className="flex flex-wrap items-end gap-3">
                        {/* Query */}
                        <div className="flex-1 min-w-[200px]">
                            <label className="mb-1 block text-xs font-medium text-gray-400">Query</label>
                            <input
                                type="text"
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') void handleSearch() }}
                                placeholder="Search your documents..."
                                className="w-full rounded-lg border border-gray-700 bg-background px-3 py-2 text-sm text-gray-200 placeholder-gray-500 transition focus:border-brand-primary focus:outline-none"
                            />
                        </div>

                        {/* Mode Toggle */}
                        <div>
                            <label className="mb-1 block text-xs font-medium text-gray-400">Mode</label>
                            <div className="inline-flex rounded-lg border border-gray-700 bg-background">
                                <button
                                    type="button"
                                    onClick={() => setMode('hybrid')}
                                    className={cn(
                                        'flex items-center gap-1.5 rounded-l-lg px-3 py-2 text-xs font-medium transition',
                                        mode === 'hybrid'
                                            ? 'bg-brand-primary/10 text-brand-primary'
                                            : 'text-gray-400 hover:text-gray-300',
                                    )}
                                >
                                    <Zap className="h-3 w-3" />
                                    Hybrid
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setMode('vector')}
                                    className={cn(
                                        'flex items-center gap-1.5 rounded-r-lg px-3 py-2 text-xs font-medium transition',
                                        mode === 'vector'
                                            ? 'bg-brand-primary/10 text-brand-primary'
                                            : 'text-gray-400 hover:text-gray-300',
                                    )}
                                >
                                    <Database className="h-3 w-3" />
                                    Vector
                                </button>
                            </div>
                        </div>

                        {/* Top-K */}
                        <div className="w-20">
                            <label className="mb-1 block text-xs font-medium text-gray-400">Top K</label>
                            <input
                                type="number"
                                value={topK}
                                onChange={e => setTopK(Math.min(Math.max(parseInt(e.target.value) || 1, 1), 20))}
                                min={1}
                                max={20}
                                className="w-full rounded-lg border border-gray-700 bg-background px-3 py-2 text-sm text-gray-200"
                            />
                        </div>

                        {/* Search Button */}
                        <button
                            type="button"
                            onClick={() => void handleSearch()}
                            disabled={!query.trim() || loading || readyDocs.length === 0}
                            className={cn(
                                'flex items-center gap-2 rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-black transition hover:brightness-110',
                                (!query.trim() || loading || readyDocs.length === 0) && 'cursor-not-allowed opacity-50',
                            )}
                        >
                            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                            Search
                        </button>
                    </div>

                    {/* Filters */}
                    <div className="flex flex-wrap gap-4">
                        {/* Document filter */}
                        {readyDocs.length > 0 && (
                            <div>
                                <span className="mb-1 block text-xs font-medium text-gray-400">Filter by Document</span>
                                <div className="flex flex-wrap gap-1.5">
                                    {readyDocs.map(doc => (
                                        <button
                                            key={doc.id}
                                            type="button"
                                            onClick={() => toggleDoc(doc.id)}
                                            className={cn(
                                                'rounded-full border px-2.5 py-0.5 text-xs transition',
                                                selectedDocs.includes(doc.id)
                                                    ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
                                                    : 'border-gray-700 text-gray-400 hover:border-gray-600',
                                            )}
                                        >
                                            {doc.name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Tag filter */}
                        {allTags.length > 0 && (
                            <div>
                                <span className="mb-1 block text-xs font-medium text-gray-400">Filter by Tag</span>
                                <div className="flex flex-wrap gap-1.5">
                                    {allTags.map(tag => (
                                        <button
                                            key={tag}
                                            type="button"
                                            onClick={() => toggleTag(tag)}
                                            className={cn(
                                                'rounded-full border px-2.5 py-0.5 text-xs transition',
                                                selectedTags.includes(tag)
                                                    ? 'border-purple-500 bg-purple-500/10 text-purple-400'
                                                    : 'border-gray-700 text-gray-400 hover:border-gray-600',
                                            )}
                                        >
                                            #{tag}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-400">
                            {error}
                        </div>
                    )}

                    {/* Results */}
                    {results && (
                        <div className="space-y-3">
                            {/* Summary */}
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-gray-400">
                                    {String(results.count)} result{results.count !== 1 ? 's' : ''} in {String(results.durationMs)}ms
                                    <span className="ml-2 rounded bg-gray-800 px-1.5 py-0.5 text-xs">
                                        {results.mode}
                                    </span>
                                </span>
                            </div>

                            {/* Result cards */}
                            {results.results.length === 0 ? (
                                <div className="rounded-lg border border-gray-800 p-6 text-center text-sm text-gray-500">
                                    No matching chunks found. Try a different query.
                                </div>
                            ) : (
                                results.results.map((r, idx) => (
                                    <div
                                        key={`${r.document_id ?? ''}-${String(r.chunk_index ?? idx)}`}
                                        className="rounded-lg border border-gray-800 bg-background/50 p-3 transition hover:border-gray-700"
                                    >
                                        <div className="mb-2 flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <FileText className="h-3.5 w-3.5 shrink-0 text-gray-500" />
                                                <span className="truncate text-xs font-medium text-gray-300">{r.document_name}</span>
                                                {r.chunk_index != null && (
                                                    <span className="shrink-0 text-xs text-gray-600">§{String(r.chunk_index)}</span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-1.5 shrink-0">
                                                {results.mode === 'hybrid' && r.vector_similarity != null && (
                                                    <>
                                                        <ScoreBadge score={r.vector_similarity} label="Vec" />
                                                        <ScoreBadge score={r.text_rank ?? 0} label="Text" />
                                                        <ScoreBadge score={r.combined_score ?? r.similarity} label="Combined" />
                                                    </>
                                                )}
                                                {results.mode === 'vector' && (
                                                    <ScoreBadge score={r.similarity} />
                                                )}
                                            </div>
                                        </div>

                                        {/* Content */}
                                        <div className="relative">
                                            <p className={cn(
                                                'text-xs leading-relaxed text-gray-400 whitespace-pre-wrap',
                                                !expandedChunks.has(idx) && r.content.length > 300 && 'line-clamp-4',
                                            )}>
                                                {r.content}
                                            </p>
                                            {r.content.length > 300 && (
                                                <button
                                                    type="button"
                                                    onClick={() => toggleChunk(idx)}
                                                    className="mt-1 text-xs text-brand-primary hover:underline"
                                                >
                                                    {expandedChunks.has(idx) ? 'Show less' : 'Show more'}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {/* Empty state */}
                    {!results && !loading && readyDocs.length === 0 && (
                        <div className="rounded-lg border border-dashed border-gray-700 p-6 text-center">
                            <Database className="mx-auto mb-2 h-6 w-6 text-gray-600" />
                            <p className="text-sm text-gray-400">Upload and process documents first</p>
                            <p className="mt-1 text-xs text-gray-500">Then you can test retrieval quality here</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
