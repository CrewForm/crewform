// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useState, useEffect } from 'react'
import { X, Upload, Loader2, Plus, Tag, FileText, Eye, Edit3 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { useSubmitTeam } from '@/hooks/useMarketplace'
import type { Team } from '@/types'

interface PublishTeamModalProps {
    team: Team | null
    onClose: () => void
}

const SUGGESTED_TAGS = [
    'productivity', 'writing', 'coding', 'research', 'marketing',
    'data-analysis', 'customer-support', 'pipeline', 'orchestrator',
    'collaboration', 'automation', 'devops', 'sales', 'creative',
]

export function PublishTeamModal({ team, onClose }: PublishTeamModalProps) {
    const { user } = useAuth()
    const submitMutation = useSubmitTeam()
    const [tags, setTags] = useState<string[]>([])
    const [newTag, setNewTag] = useState('')
    const [readme, setReadme] = useState('')
    const [readmePreview, setReadmePreview] = useState(false)

    // Pre-fill existing tags
    useEffect(() => {
        if (team?.marketplace_tags && team.marketplace_tags.length > 0) {
            setTags(team.marketplace_tags)
        } else {
            setTags([])
        }
    }, [team?.marketplace_tags])

    // Pre-fill existing README
    useEffect(() => {
        setReadme(team?.marketplace_readme ?? '')
    }, [team?.marketplace_readme])

    if (!team) return null

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
            { teamId: team.id, tags, readme, userId: user.id },
            {
                onSuccess: () => {
                    toast.success('Team submitted for review! You\'ll be notified when it\'s approved.')
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
                        <h2 className="text-lg font-semibold text-gray-100">Publish Team to Marketplace</h2>
                    </div>
                    <button type="button" onClick={onClose} className="rounded-lg p-1 text-gray-500 hover:text-gray-300">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="space-y-5 p-5">
                    {/* Team info */}
                    <div className="rounded-lg border border-border bg-surface-card p-3">
                        <p className="text-sm font-medium text-gray-200">{team.name}</p>
                        <p className="mt-1 text-xs text-gray-500">{team.description}</p>
                        <span className="mt-2 inline-block rounded-full bg-surface-overlay px-2 py-0.5 text-[10px] font-medium text-gray-400 capitalize">
                            {team.mode} mode
                        </span>
                    </div>

                    {/* Note about included agents */}
                    <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3">
                        <p className="text-xs text-blue-300">
                            All member agents will be included in the published team. Users who install this team
                            will receive copies of each agent with their configurations.
                        </p>
                    </div>

                    {/* README */}
                    <div>
                        <div className="mb-2 flex items-center justify-between">
                            <label className="flex items-center gap-1 text-xs font-medium text-gray-400">
                                <FileText className="h-3 w-3" />
                                README (optional — Markdown supported)
                            </label>
                            {readme.trim() && (
                                <button
                                    type="button"
                                    onClick={() => setReadmePreview(!readmePreview)}
                                    className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300"
                                >
                                    {readmePreview ? <Edit3 className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                                    {readmePreview ? 'Edit' : 'Preview'}
                                </button>
                            )}
                        </div>
                        {readmePreview ? (
                            <div
                                className="prose prose-invert prose-sm max-w-none rounded-lg border border-border bg-surface-card p-3 text-gray-300"
                                dangerouslySetInnerHTML={{ __html: readme
                                    .replace(/^### (.*$)/gm, '<h4 class="text-gray-200 text-sm font-semibold mt-3 mb-1">$1</h4>')
                                    .replace(/^## (.*$)/gm, '<h3 class="text-gray-100 text-sm font-bold mt-4 mb-1">$1</h3>')
                                    .replace(/^# (.*$)/gm, '<h2 class="text-gray-100 text-base font-bold mt-4 mb-2">$1</h2>')
                                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                                    .replace(/\*(.*?)\*/g, '<em>$1</em>')
                                    .replace(/`(.*?)`/g, '<code class="rounded bg-surface-overlay px-1 py-0.5 text-[11px] text-brand-primary">$1</code>')
                                    .replace(/^- (.*$)/gm, '<li class="ml-4 list-disc text-xs text-gray-400">$1</li>')
                                    .replace(/\n/g, '<br />')
                                }}
                            />
                        ) : (
                            <textarea
                                value={readme}
                                onChange={(e) => setReadme(e.target.value)}
                                placeholder={`## What This Team Does\n\nDescribe the team workflow...\n\n## Use Cases\n\n- Research → Write → Review pipeline\n- Customer support escalation\n\n## Included Agents\n\n- Agent 1: Researcher\n- Agent 2: Writer`}
                                rows={6}
                                className="w-full rounded-lg border border-border bg-surface-card px-3 py-2 text-xs text-gray-200 placeholder-gray-600 outline-none focus:border-brand-primary font-mono"
                            />
                        )}
                    </div>

                    {/* Tags */}
                    <div>
                        <label className="mb-2 block text-xs font-medium text-gray-400">
                            <Tag className="mr-1 inline h-3 w-3" />
                            Tags (at least 1 required)
                        </label>

                        <div className="mb-2 flex flex-wrap gap-1.5">
                            {tags.map((tag) => (
                                <span
                                    key={tag}
                                    className="flex items-center gap-1 rounded-md bg-brand-primary/10 px-2 py-0.5 text-xs font-medium text-brand-primary"
                                >
                                    {tag}
                                    <button type="button" onClick={() => removeTag(tag)} className="hover:text-red-400">
                                        <X className="h-3 w-3" />
                                    </button>
                                </span>
                            ))}
                        </div>

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
