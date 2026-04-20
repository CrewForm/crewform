// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useState, useCallback } from 'react'
import {
    Sparkles, Bot, Users, LayoutGrid, Wrench, MessageSquare,
    BookOpen, Webhook, Store, ChevronRight, ChevronLeft,
    Rocket, Key, Globe, ArrowRight, X,
} from 'lucide-react'
import { useWorkspace } from '@/hooks/useWorkspace'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'

// ─── Tour Steps ─────────────────────────────────────────────────────────────

const STEPS = [
    { key: 'welcome', label: 'Welcome' },
    { key: 'build', label: 'What You Can Build' },
    { key: 'features', label: 'Key Features' },
    { key: 'start', label: 'Getting Started' },
    { key: 'ready', label: 'Ready!' },
] as const

type StepKey = (typeof STEPS)[number]['key']

// ─── Feature Cards Data ─────────────────────────────────────────────────────

const BUILD_CARDS = [
    {
        icon: Bot,
        title: 'AI Agents',
        desc: 'Configure models, prompts, tools, and connect 16+ LLM providers or run locally with Ollama.',
        color: 'text-blue-400',
        bg: 'bg-blue-500/10',
    },
    {
        icon: Users,
        title: 'Multi-Agent Teams',
        desc: 'Pipeline, Orchestrator, Collaboration, and Autonomous modes — agents working together.',
        color: 'text-purple-400',
        bg: 'bg-purple-500/10',
    },
    {
        icon: LayoutGrid,
        title: 'Visual Canvas',
        desc: 'Drag-and-drop workflow builder with real-time execution visualization.',
        color: 'text-emerald-400',
        bg: 'bg-emerald-500/10',
    },
    {
        icon: Store,
        title: 'Marketplace',
        desc: 'Install pre-built agents and team templates — get productive instantly.',
        color: 'text-amber-400',
        bg: 'bg-amber-500/10',
    },
]

const FEATURE_CARDS = [
    {
        icon: Wrench,
        title: 'MCP Tools',
        desc: 'Connect external tools and data sources to your agents via the Model Context Protocol.',
        color: 'text-cyan-400',
        bg: 'bg-cyan-500/10',
    },
    {
        icon: MessageSquare,
        title: 'Messaging Channels',
        desc: 'Trigger agents from Slack, Discord, Telegram, Email, or embed a chat widget.',
        color: 'text-pink-400',
        bg: 'bg-pink-500/10',
    },
    {
        icon: BookOpen,
        title: 'Knowledge Base',
        desc: 'Upload documents for RAG — agents search and cite your own content.',
        color: 'text-orange-400',
        bg: 'bg-orange-500/10',
    },
    {
        icon: Webhook,
        title: 'Webhooks & Integrations',
        desc: 'Push results to Slack, Discord, Trello, Asana, Zapier, and more.',
        color: 'text-indigo-400',
        bg: 'bg-indigo-500/10',
    },
]

const QUICKSTART_PATHS = [
    {
        icon: Key,
        title: 'Add Your API Key',
        desc: 'Go to Settings → API Keys to configure your LLM provider.',
        route: '/settings',
        color: 'text-blue-400',
        bg: 'bg-blue-500/10',
        border: 'border-blue-500/20',
    },
    {
        icon: Store,
        title: 'Browse Marketplace',
        desc: 'Install a pre-built agent or team template to get started instantly.',
        route: '/marketplace',
        color: 'text-amber-400',
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/20',
    },
    {
        icon: LayoutGrid,
        title: 'Explore the Canvas',
        desc: 'Open the visual canvas to build and visualize your agent workflows.',
        route: '/canvas',
        color: 'text-emerald-400',
        bg: 'bg-emerald-500/10',
        border: 'border-emerald-500/20',
    },
]

// ─── Component ──────────────────────────────────────────────────────────────

export function OnboardingWizard() {
    const { workspaceId, workspace, isLoading: workspaceLoading } = useWorkspace()
    const navigate = useNavigate()
    const queryClient = useQueryClient()

    const [step, setStep] = useState<StepKey>('welcome')
    const currentIdx = STEPS.findIndex(s => s.key === step)

    // ── Complete onboarding (used by both Skip and final step) ──
    const handleComplete = useCallback(async (redirectTo?: string) => {
        if (!workspaceId) return
        try {
            const settings = workspace?.settings ?? {}
            await supabase
                .from('workspaces')
                .update({ settings: { ...settings, onboarding_completed: true } })
                .eq('id', workspaceId)
            void queryClient.invalidateQueries({ queryKey: ['workspace'] })
            navigate(redirectTo ?? '/agents')
        } catch {
            // Silent fail — user can always dismiss later
            navigate(redirectTo ?? '/agents')
        }
    }, [workspaceId, workspace, queryClient, navigate])

    const goNext = useCallback(() => {
        const nextIdx = currentIdx + 1
        if (nextIdx < STEPS.length) {
            setStep(STEPS[nextIdx].key)
        }
    }, [currentIdx])

    const goBack = useCallback(() => {
        const prevIdx = currentIdx - 1
        if (prevIdx >= 0) {
            setStep(STEPS[prevIdx].key)
        }
    }, [currentIdx])

    if (workspaceLoading) {
        return (
            <div className="mx-auto max-w-2xl py-8 px-4 flex flex-col items-center justify-center gap-4">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" />
                <p className="text-sm text-gray-400">Loading workspace…</p>
            </div>
        )
    }

    return (
        <div className="mx-auto max-w-2xl py-8 px-4">
            {/* Skip button — always visible */}
            <div className="mb-6 flex justify-end">
                <button
                    type="button"
                    onClick={() => void handleComplete()}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-gray-500 transition-colors hover:text-gray-300 hover:bg-white/5"
                >
                    Skip & Explore
                    <X className="h-3 w-3" />
                </button>
            </div>

            {/* Progress dots */}
            <div className="mb-8 flex items-center justify-center gap-2">
                {STEPS.map((s, i) => (
                    <div
                        key={s.key}
                        className={cn(
                            'h-2 rounded-full transition-all duration-300',
                            i === currentIdx ? 'w-8 bg-brand-primary' :
                                i < currentIdx ? 'w-2 bg-emerald-500/50' :
                                    'w-2 bg-gray-700',
                        )}
                    />
                ))}
            </div>

            {/* Step content */}
            <div className="rounded-2xl border border-border bg-surface-card p-8">

                {/* ── Step 1: Welcome ── */}
                {step === 'welcome' && (
                    <div className="text-center">
                        <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-primary/20 to-purple-500/20 ring-1 ring-white/10">
                            <Sparkles className="h-10 w-10 text-brand-primary" />
                        </div>
                        <h2 className="mb-2 text-2xl font-bold text-gray-100">Welcome to CrewForm</h2>
                        <p className="mb-2 text-base text-gray-400">
                            Build, deploy, and orchestrate AI agent teams.
                        </p>
                        <p className="mb-8 text-sm text-gray-500 leading-relaxed max-w-md mx-auto">
                            Let&apos;s take a quick look at what you can do. This only takes 30 seconds —
                            or skip anytime to start exploring on your own.
                        </p>
                        <button
                            type="button"
                            onClick={goNext}
                            className="mx-auto flex items-center gap-2 rounded-lg bg-brand-primary px-6 py-2.5 text-sm font-medium text-black hover:bg-brand-hover transition-colors"
                        >
                            Take the Tour
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    </div>
                )}

                {/* ── Step 2: What You Can Build ── */}
                {step === 'build' && (
                    <div>
                        <div className="text-center mb-6">
                            <h2 className="mb-1 text-xl font-semibold text-gray-100">What You Can Build</h2>
                            <p className="text-sm text-gray-500">CrewForm gives you everything to create powerful AI workflows.</p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                            {BUILD_CARDS.map(card => {
                                const Icon = card.icon
                                return (
                                    <div
                                        key={card.title}
                                        className="rounded-xl border border-border bg-surface-primary p-4 transition-colors hover:border-white/10"
                                    >
                                        <div className={cn('mb-2 flex h-9 w-9 items-center justify-center rounded-lg', card.bg)}>
                                            <Icon className={cn('h-4.5 w-4.5', card.color)} />
                                        </div>
                                        <h3 className="mb-1 text-sm font-medium text-gray-200">{card.title}</h3>
                                        <p className="text-xs text-gray-500 leading-relaxed">{card.desc}</p>
                                    </div>
                                )
                            })}
                        </div>

                        <div className="flex items-center justify-between">
                            <button
                                type="button"
                                onClick={goBack}
                                className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
                            >
                                <ChevronLeft className="h-3 w-3" />
                                Back
                            </button>
                            <button
                                type="button"
                                onClick={goNext}
                                className="flex items-center gap-2 rounded-lg bg-brand-primary px-5 py-2 text-sm font-medium text-black hover:bg-brand-hover transition-colors"
                            >
                                Next
                                <ChevronRight className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                )}

                {/* ── Step 3: Key Features ── */}
                {step === 'features' && (
                    <div>
                        <div className="text-center mb-6">
                            <h2 className="mb-1 text-xl font-semibold text-gray-100">Powerful Features</h2>
                            <p className="text-sm text-gray-500">Connect your agents to the tools and channels your team already uses.</p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                            {FEATURE_CARDS.map(card => {
                                const Icon = card.icon
                                return (
                                    <div
                                        key={card.title}
                                        className="rounded-xl border border-border bg-surface-primary p-4 transition-colors hover:border-white/10"
                                    >
                                        <div className={cn('mb-2 flex h-9 w-9 items-center justify-center rounded-lg', card.bg)}>
                                            <Icon className={cn('h-4.5 w-4.5', card.color)} />
                                        </div>
                                        <h3 className="mb-1 text-sm font-medium text-gray-200">{card.title}</h3>
                                        <p className="text-xs text-gray-500 leading-relaxed">{card.desc}</p>
                                    </div>
                                )
                            })}
                        </div>

                        {/* Protocol badges */}
                        <div className="mb-6 flex flex-wrap items-center justify-center gap-2">
                            {[
                                { label: 'MCP', icon: Globe },
                                { label: 'A2A', icon: Users },
                                { label: 'AG-UI', icon: LayoutGrid },
                            ].map(proto => {
                                const Icon = proto.icon
                                return (
                                    <div
                                        key={proto.label}
                                        className="flex items-center gap-1.5 rounded-full border border-border bg-surface-primary px-3 py-1"
                                    >
                                        <Icon className="h-3 w-3 text-brand-primary" />
                                        <span className="text-[11px] font-medium text-gray-400">{proto.label} Protocol</span>
                                    </div>
                                )
                            })}
                        </div>

                        <div className="flex items-center justify-between">
                            <button
                                type="button"
                                onClick={goBack}
                                className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
                            >
                                <ChevronLeft className="h-3 w-3" />
                                Back
                            </button>
                            <button
                                type="button"
                                onClick={goNext}
                                className="flex items-center gap-2 rounded-lg bg-brand-primary px-5 py-2 text-sm font-medium text-black hover:bg-brand-hover transition-colors"
                            >
                                Next
                                <ChevronRight className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                )}

                {/* ── Step 4: Getting Started Paths ── */}
                {step === 'start' && (
                    <div>
                        <div className="text-center mb-6">
                            <h2 className="mb-1 text-xl font-semibold text-gray-100">3 Ways to Get Started</h2>
                            <p className="text-sm text-gray-500">Pick any path — you can always do the others later.</p>
                        </div>

                        <div className="space-y-3 mb-6">
                            {QUICKSTART_PATHS.map((path, i) => {
                                const Icon = path.icon
                                return (
                                    <button
                                        key={path.title}
                                        type="button"
                                        onClick={() => void handleComplete(path.route)}
                                        className={cn(
                                            'w-full flex items-center gap-4 rounded-xl border p-4 text-left transition-all hover:bg-white/[0.02]',
                                            path.border,
                                        )}
                                    >
                                        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', path.bg)}>
                                            <Icon className={cn('h-5 w-5', path.color)} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/5 text-[10px] font-bold text-gray-500">
                                                    {i + 1}
                                                </span>
                                                <h3 className="text-sm font-medium text-gray-200">{path.title}</h3>
                                            </div>
                                            <p className="mt-0.5 text-xs text-gray-500 pl-7">{path.desc}</p>
                                        </div>
                                        <ArrowRight className="h-4 w-4 text-gray-600 shrink-0" />
                                    </button>
                                )
                            })}
                        </div>

                        <div className="flex items-center justify-between">
                            <button
                                type="button"
                                onClick={goBack}
                                className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
                            >
                                <ChevronLeft className="h-3 w-3" />
                                Back
                            </button>
                            <button
                                type="button"
                                onClick={goNext}
                                className="flex items-center gap-2 rounded-lg bg-brand-primary px-5 py-2 text-sm font-medium text-black hover:bg-brand-hover transition-colors"
                            >
                                Next
                                <ChevronRight className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                )}

                {/* ── Step 5: Ready! ── */}
                {step === 'ready' && (
                    <div className="text-center">
                        <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500/20 to-brand-primary/20 ring-1 ring-white/10">
                            <Rocket className="h-10 w-10 text-emerald-400" />
                        </div>
                        <h2 className="mb-2 text-2xl font-bold text-gray-100">You&apos;re Ready!</h2>
                        <p className="mb-6 text-sm text-gray-400 leading-relaxed max-w-md mx-auto">
                            Your workspace is set up and waiting. Start by adding an API key and creating
                            your first agent, or browse the marketplace for pre-built templates.
                        </p>

                        <div className="flex flex-col items-center gap-3">
                            <button
                                type="button"
                                onClick={() => void handleComplete('/agents')}
                                className="flex items-center gap-2 rounded-lg bg-brand-primary px-6 py-2.5 text-sm font-medium text-black hover:bg-brand-hover transition-colors"
                            >
                                Start Building
                                <ArrowRight className="h-4 w-4" />
                            </button>
                            <div className="flex items-center gap-4">
                                <button
                                    type="button"
                                    onClick={() => void handleComplete('/marketplace')}
                                    className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                                >
                                    Browse Marketplace
                                </button>
                                <span className="text-gray-700">·</span>
                                <a
                                    href="https://docs.crewform.tech"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                                >
                                    Read the Docs
                                </a>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Step counter */}
            <p className="mt-4 text-center text-[11px] text-gray-600">
                {currentIdx + 1} of {STEPS.length}
            </p>
        </div>
    )
}
