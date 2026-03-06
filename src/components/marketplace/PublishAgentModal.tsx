// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useState, useEffect } from 'react'
import { X, Upload, ShieldCheck, ShieldAlert, Loader2, Plus, Tag } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useSubmitAgent } from '@/hooks/useMarketplace'
import { scanForInjection } from '@/db/marketplace'
import type { Agent } from '@/types'
import { cn } from '@/lib/utils'

interface PublishAgentModalProps {
    agent: Agent | null
    onClose: () => void
}

const SUGGESTED_TAGS = [
    'productivity', 'writing', 'coding', 'research', 'marketing',
    'data-analysis', 'customer-support', 'finance', 'education',
    'creative', 'automation', 'devops', 'sales', 'legal', 'hr',
]

/**
 * Modal to publish an agent to the marketplace.
 * Includes tag editor and injection scan preview.
 */
export function PublishAgentModal({ agent, onClose }: PublishAgentModalProps) {
    const { user } = useAuth()
    const submitMutation = useSubmitAgent()
    const [tags, setTags] = useState<string[]>([])
    const [newTag, setNewTag] = useState('')
    const [scanResult, setScanResult] = useState<{ safe: boolean; flags: string[] } | null>(null)

    // Run injection scan when agent changes
    useEffect(() => {
        if (agent?.system_prompt) {
            setScanResult(scanForInjection(agent.system_prompt))
        } else {
            setScanResult(null)
        }
    }, [agent?.system_prompt])

    // Pre-fill existing tags
    useEffect(() => {
        if (agent?.marketplace_tags && agent.marketplace_tags.length > 0) {
            setTags(agent.marketplace_tags)
        } else {
            setTags([])
        }
    }, [agent?.marketplace_tags])

    if (!agent) return null

    const addTag = (tag: string) => {
        const normalized = tag.toLowerCase().trim()
        if (normalized && !tags.includes(normalized)) {
            setTags((prev) => [...prev, normalized])
        }
        setNewTag('')
    }

    const removeTag = (tag: string) => {
        setTags((prev) => prev.filter((t) => t !== tag))
    }

    const handleSubmit = () => {
        if (!user) return
        submitMutation.mutate(
            { agentId: agent.id, tags, userId: user.id },
            {
                onSuccess: () => {
                    onClose()
                },
            },
        )
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-lg rounded-xl border border-border bg-surface-primary shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-border px-5 py-4">
                    <div className="flex items-center gap-2">
                        <Upload className="h-5 w-5 text-brand-primary" />
                        <h2 className="text-lg font-semibold text-gray-100">Publish to Marketplace</h2>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-1 text-gray-500 hover:text-gray-300"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="space-y-5 p-5">
                    {/* Agent info */}
                    <div className="rounded-lg border border-border bg-surface-card p-3">
                        <p className="text-sm font-medium text-gray-200">{agent.name}</p>
                        <p className="mt-1 text-xs text-gray-500">{agent.description}</p>
                    </div>

                    {/* Injection scan result */}
                    {scanResult && (
                        <div className={cn(
                            'flex items-start gap-2 rounded-lg border px-4 py-3',
                            scanResult.safe
                                ? 'border-green-500/20 bg-green-500/5'
                                : 'border-red-500/20 bg-red-500/5',
                        )}>
                            {scanResult.safe ? (
                                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-green-400" />
                            ) : (
                                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                            )}
                            <div>
                                <p className={cn('text-sm font-medium', scanResult.safe ? 'text-green-300' : 'text-red-300')}>
                                    {scanResult.safe ? 'Injection scan passed' : 'Potential issues detected'}
                                </p>
                                {scanResult.flags.length > 0 && (
                                    <ul className="mt-1 space-y-0.5">
                                        {scanResult.flags.map((flag) => (
                                            <li key={flag} className="text-xs text-red-400">• {flag}</li>
                                        ))}
                                    </ul>
                                )}
                                {!scanResult.safe && (
                                    <p className="mt-2 text-xs text-gray-500">
                                        Your submission will still be reviewed but flagged items will be inspected.
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Tags */}
                    <div>
                        <label className="mb-2 block text-xs font-medium text-gray-400">
                            <Tag className="mr-1 inline h-3 w-3" />
                            Tags (at least 1 required)
                        </label>

                        {/* Current tags */}
                        <div className="mb-2 flex flex-wrap gap-1.5">
                            {tags.map((tag) => (
                                <span
                                    key={tag}
                                    className="flex items-center gap-1 rounded-md bg-brand-primary/10 px-2 py-0.5 text-xs font-medium text-brand-primary"
                                >
                                    {tag}
                                    <button
                                        type="button"
                                        onClick={() => removeTag(tag)}
                                        className="hover:text-red-400"
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                </span>
                            ))}
                        </div>

                        {/* Add tag input */}
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={newTag}
                                onChange={(e) => setNewTag(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && addTag(newTag)}
                                placeholder="Add a tag..."
                                className="flex-1 rounded-lg border border-border bg-surface-card px-3 py-1.5 text-xs text-gray-200 outline-none focus:border-brand-primary"
                            />
                            <button
                                type="button"
                                onClick={() => addTag(newTag)}
                                disabled={!newTag.trim()}
                                className="rounded-lg border border-border px-2 py-1.5 text-xs text-gray-400 hover:bg-surface-elevated disabled:opacity-30"
                            >
                                <Plus className="h-3 w-3" />
                            </button>
                        </div>

                        {/* Suggested tags */}
                        <div className="mt-2 flex flex-wrap gap-1">
                            {SUGGESTED_TAGS.filter((t) => !tags.includes(t)).slice(0, 8).map((tag) => (
                                <button
                                    key={tag}
                                    type="button"
                                    onClick={() => addTag(tag)}
                                    className="rounded-md border border-border px-2 py-0.5 text-[10px] text-gray-500 hover:border-brand-primary hover:text-brand-primary"
                                >
                                    + {tag}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-gray-400 hover:text-gray-200"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={tags.length === 0 || submitMutation.isPending}
                        className="flex items-center gap-1.5 rounded-lg bg-brand-primary px-4 py-2 text-xs font-semibold text-black transition-colors hover:bg-brand-hover disabled:opacity-50"
                    >
                        {submitMutation.isPending ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                            <Upload className="h-3 w-3" />
                        )}
                        Submit for Review
                    </button>
                </div>
            </div>
        </div>
    )
}
