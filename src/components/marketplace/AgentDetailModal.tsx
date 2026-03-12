// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useState } from 'react'
import { Star, Download, Bot, Cpu, Tag, Lock, Loader2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useWorkspace } from '@/hooks/useWorkspace'
import { useAgentReviews, useSubmitRating } from '@/hooks/useMarketplace'
import { SlidePanel } from '@/components/shared/SlidePanel'
import type { Agent } from '@/types'
import { cn } from '@/lib/utils'

interface AgentDetailModalProps {
    agent: Agent | null
    onClose: () => void
    onInstall?: (agent: Agent) => void
    isInstalling?: boolean
}

export function AgentDetailModal({ agent, onClose, onInstall, isInstalling }: AgentDetailModalProps) {
    const { user } = useAuth()
    const { workspaceId } = useWorkspace()
    const { data: reviews = [] } = useAgentReviews(agent?.id ?? null)
    const submitRating = useSubmitRating()

    const [hoverStar, setHoverStar] = useState(0)
    const [selectedStar, setSelectedStar] = useState(0)
    const [reviewText, setReviewText] = useState('')
    const [showReviewForm, setShowReviewForm] = useState(false)

    if (!agent) return null

    const handleSubmitRating = () => {
        if (!user || !workspaceId || selectedStar === 0) return
        submitRating.mutate(
            { agentId: agent.id, userId: user.id, workspaceId, rating: selectedStar, reviewText },
            {
                onSuccess: () => {
                    setShowReviewForm(false)
                    setSelectedStar(0)
                    setReviewText('')
                },
            },
        )
    }

    // Check if current user already reviewed
    const userReview = reviews.find(r => r.user_id === user?.id)

    return (
        <SlidePanel
            open
            onClose={onClose}
            footer={
                <button
                    type="button"
                    onClick={() => onInstall?.(agent)}
                    disabled={isInstalling}
                    className="w-full rounded-lg bg-brand-primary px-4 py-3 text-sm font-semibold text-black transition-colors hover:bg-brand-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Download className="mr-2 inline h-4 w-4" />
                    {isInstalling ? 'Installing...' : 'Install Agent'}
                </button>
            }
        >
            {/* Header */}
            <div className="mb-6">
                <div className="flex items-start gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-brand-primary/10">
                        <Bot className="h-7 w-7 text-brand-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h2 className="text-xl font-bold text-gray-100">{agent.name}</h2>
                        <div className="mt-1 flex items-center gap-3 text-sm text-gray-400">
                            <span className="flex items-center gap-1">
                                <Cpu className="h-3.5 w-3.5" />
                                {agent.provider} · {agent.model}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Stats */}
                <div className="mt-4 flex items-center gap-6 text-sm">
                    <span className="flex items-center gap-1.5 text-gray-300">
                        <Download className="h-4 w-4 text-gray-500" />
                        <strong>{agent.install_count.toLocaleString()}</strong> installs
                    </span>
                    <span className="flex items-center gap-1.5 text-gray-300">
                        <Star className="h-4 w-4 text-amber-400" />
                        <strong>{agent.rating_avg.toFixed(1)}</strong> rating
                    </span>
                </div>
            </div>

            <div className="space-y-6">
                {/* Description */}
                <section>
                    <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-gray-500">
                        Description
                    </h3>
                    <p className="text-sm leading-relaxed text-gray-300">{agent.description}</p>
                </section>

                {/* System Prompt — PROTECTED */}
                <section>
                    <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-gray-500">
                        <Bot className="h-4 w-4" />
                        System Prompt
                    </h3>
                    <div className="rounded-lg border border-dashed border-surface-border bg-surface-overlay p-6 text-center">
                        <Lock className="mx-auto mb-2 h-6 w-6 text-gray-500" />
                        <p className="text-sm font-medium text-gray-300">System Prompt Protected</p>
                        <p className="mt-1 text-xs text-gray-500">
                            System prompts are hidden to protect the creator&apos;s intellectual property.
                            Install this agent to use it in your workspace.
                        </p>
                    </div>
                </section>

                {/* Tags */}
                {agent.marketplace_tags.length > 0 && (
                    <section>
                        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-gray-500">
                            <Tag className="h-4 w-4" />
                            Tags
                        </h3>
                        <div className="flex flex-wrap gap-2">
                            {agent.marketplace_tags.map((tag) => (
                                <span
                                    key={tag}
                                    className="rounded-full bg-surface-overlay px-3 py-1 text-xs font-medium text-gray-400"
                                >
                                    {tag}
                                </span>
                            ))}
                        </div>
                    </section>
                )}

                {/* Details grid */}
                <section>
                    <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-gray-500">
                        Details
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-lg bg-surface-overlay p-3">
                            <p className="text-xs text-gray-500">Model</p>
                            <p className="text-sm font-medium text-gray-200">{agent.model}</p>
                        </div>
                        <div className="rounded-lg bg-surface-overlay p-3">
                            <p className="text-xs text-gray-500">Provider</p>
                            <p className="text-sm font-medium text-gray-200">{agent.provider ?? 'Unknown'}</p>
                        </div>
                        <div className="rounded-lg bg-surface-overlay p-3">
                            <p className="text-xs text-gray-500">Temperature</p>
                            <p className="text-sm font-medium text-gray-200">{agent.temperature}</p>
                        </div>
                        <div className="rounded-lg bg-surface-overlay p-3">
                            <p className="text-xs text-gray-500">Tools</p>
                            <p className="text-sm font-medium text-gray-200">
                                {agent.tools.length > 0 ? agent.tools.join(', ') : 'None'}
                            </p>
                        </div>
                    </div>
                </section>

                {/* Rating Section */}
                <section>
                    <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-gray-500">
                        <Star className="h-4 w-4" />
                        Ratings & Reviews
                    </h3>

                    {/* User's review / Rate CTA */}
                    {user && (
                        <div className="mb-4">
                            {userReview && !showReviewForm ? (
                                <div className="rounded-lg border border-brand-primary/20 bg-brand-primary/5 p-3">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-xs font-medium text-gray-300">Your rating:</span>
                                        <div className="flex gap-0.5">
                                            {[1, 2, 3, 4, 5].map((s) => (
                                                <Star key={s} className={cn('h-3.5 w-3.5', s <= userReview.rating ? 'fill-amber-400 text-amber-400' : 'text-gray-600')} />
                                            ))}
                                        </div>
                                    </div>
                                    {userReview.review_text && (
                                        <p className="text-xs text-gray-400">{userReview.review_text}</p>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSelectedStar(userReview.rating)
                                            setReviewText(userReview.review_text)
                                            setShowReviewForm(true)
                                        }}
                                        className="mt-2 text-[10px] text-brand-primary hover:underline"
                                    >
                                        Update rating
                                    </button>
                                </div>
                            ) : showReviewForm ? (
                                <div className="rounded-lg border border-border bg-surface-overlay p-4">
                                    {/* Star selector */}
                                    <div className="mb-3">
                                        <p className="mb-1.5 text-xs font-medium text-gray-300">Your rating</p>
                                        <div className="flex gap-1">
                                            {[1, 2, 3, 4, 5].map((s) => (
                                                <button
                                                    key={s}
                                                    type="button"
                                                    onMouseEnter={() => setHoverStar(s)}
                                                    onMouseLeave={() => setHoverStar(0)}
                                                    onClick={() => setSelectedStar(s)}
                                                    className="p-0.5 transition-transform hover:scale-110"
                                                >
                                                    <Star className={cn(
                                                        'h-6 w-6 transition-colors',
                                                        s <= (hoverStar || selectedStar) ? 'fill-amber-400 text-amber-400' : 'text-gray-600',
                                                    )} />
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    {/* Review text */}
                                    <textarea
                                        value={reviewText}
                                        onChange={(e) => setReviewText(e.target.value)}
                                        placeholder="Write a review (optional)..."
                                        rows={2}
                                        className="mb-3 w-full rounded-lg border border-border bg-surface-card px-3 py-2 text-xs text-gray-200 placeholder-gray-500 outline-none focus:border-brand-primary"
                                    />
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={handleSubmitRating}
                                            disabled={selectedStar === 0 || submitRating.isPending}
                                            className="flex items-center gap-1.5 rounded-lg bg-brand-primary px-3 py-1.5 text-xs font-semibold text-black transition-colors hover:bg-brand-primary/90 disabled:opacity-50"
                                        >
                                            {submitRating.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                                            Submit Rating
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => { setShowReviewForm(false); setSelectedStar(0); setReviewText('') }}
                                            className="rounded-lg border border-border px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => setShowReviewForm(true)}
                                    className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-gray-400 transition-colors hover:bg-surface-elevated hover:text-gray-200"
                                >
                                    <Star className="h-3.5 w-3.5" />
                                    Rate this agent
                                </button>
                            )}
                        </div>
                    )}

                    {/* Reviews list */}
                    {reviews.length > 0 ? (
                        <div className="space-y-3">
                            {reviews.filter(r => r.user_id !== user?.id).map((review) => (
                                <div key={review.id} className="rounded-lg bg-surface-overlay p-3">
                                    <div className="flex items-center gap-2 mb-1">
                                        <div className="flex gap-0.5">
                                            {[1, 2, 3, 4, 5].map((s) => (
                                                <Star key={s} className={cn('h-3 w-3', s <= review.rating ? 'fill-amber-400 text-amber-400' : 'text-gray-600')} />
                                            ))}
                                        </div>
                                        <span className="text-[10px] text-gray-500">
                                            {new Date(review.created_at).toLocaleDateString()}
                                        </span>
                                    </div>
                                    {review.review_text && (
                                        <p className="text-xs text-gray-400">{review.review_text}</p>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-xs text-gray-500">No reviews yet. Be the first to rate this agent!</p>
                    )}
                </section>
            </div>
        </SlidePanel>
    )
}
