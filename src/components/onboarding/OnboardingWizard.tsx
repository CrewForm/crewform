// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useState } from 'react'
import {
    Sparkles, Key, Bot, Rocket, PartyPopper,
    ChevronRight, Loader2, Check, ExternalLink,
} from 'lucide-react'
import { useWorkspace } from '@/hooks/useWorkspace'
import { useCreateAgent } from '@/hooks/useCreateAgent'
import { useAgents } from '@/hooks/useAgents'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'

// ─── Types ──────────────────────────────────────────────────────────────────

const STEPS = [
    { key: 'welcome', label: 'Welcome', icon: Sparkles },
    { key: 'provider', label: 'API Key', icon: Key },
    { key: 'agent', label: 'Create Agent', icon: Bot },
    { key: 'test', label: 'Test Run', icon: Rocket },
    { key: 'done', label: 'All Set!', icon: PartyPopper },
] as const

type StepKey = (typeof STEPS)[number]['key']

interface ProviderOption {
    id: string
    label: string
    placeholder: string
    model: string
}

const PROVIDERS: ProviderOption[] = [
    { id: 'openai', label: 'OpenAI', placeholder: 'sk-...', model: 'gpt-4o' },
    { id: 'anthropic', label: 'Anthropic', placeholder: 'sk-ant-...', model: 'claude-sonnet-4-20250514' },
    { id: 'google', label: 'Google', placeholder: 'AIza...', model: 'gemini-2.0-flash' },
]

// ─── Component ──────────────────────────────────────────────────────────────

export function OnboardingWizard() {
    const { workspaceId, workspace } = useWorkspace()
    const { agents } = useAgents(workspaceId)
    const createAgent = useCreateAgent()
    const navigate = useNavigate()
    const queryClient = useQueryClient()

    const [step, setStep] = useState<StepKey>('welcome')
    const [provider, setProvider] = useState(PROVIDERS[0])
    const [apiKey, setApiKey] = useState('')
    const [keySaved, setKeySaved] = useState(false)
    const [keySaving, setKeySaving] = useState(false)
    const [agentName, setAgentName] = useState('My First Agent')
    const [systemPrompt, setSystemPrompt] = useState('You are a helpful assistant. Be concise and accurate.')
    const [agentCreated, setAgentCreated] = useState(false)
    const [testPrompt, setTestPrompt] = useState('What is 2 + 2? Answer in one sentence.')
    const [testResult, setTestResult] = useState<string | null>(null)
    const [testRunning, setTestRunning] = useState(false)

    const currentIdx = STEPS.findIndex(s => s.key === step)

    // ── Save API key to workspace settings ──
    async function handleSaveKey() {
        if (!workspaceId || !apiKey.trim()) return
        setKeySaving(true)
        try {
            const settings = workspace?.settings ?? {}
            const providerKeys = (settings.provider_keys as Record<string, string> | undefined) ?? {}
            providerKeys[provider.id] = apiKey.trim()

            await supabase
                .from('workspaces')
                .update({ settings: { ...settings, provider_keys: providerKeys } })
                .eq('id', workspaceId)

            void queryClient.invalidateQueries({ queryKey: ['workspace'] })
            setKeySaved(true)
        } finally {
            setKeySaving(false)
        }
    }

    // ── Create the first agent ──
    async function handleCreateAgent() {
        if (!workspaceId) return
        await createAgent.mutateAsync({
            workspace_id: workspaceId,
            name: agentName,
            description: 'Created during onboarding',
            model: provider.model,
            provider: provider.id,
            system_prompt: systemPrompt,
            temperature: 0.7,
            tools: [],
        })
        setAgentCreated(true)
    }

    // ── Test run ──
    async function handleTestRun() {
        if (!workspaceId) return
        setTestRunning(true)
        setTestResult(null)

        try {
            // Find the agent we just created
            const agent = agents[0] as typeof agents[number] | undefined
            if (!agent) {
                setTestResult('No agent found — please go back and create one first.')
                return
            }

            // Create a task and dispatch it
            const { data: task, error: taskErr } = await supabase
                .from('tasks')
                .insert({
                    title: 'Onboarding Test',
                    description: testPrompt,
                    workspace_id: workspaceId,
                    assigned_agent_id: agent.id,
                    created_by: workspace?.owner_id,
                    status: 'dispatched',
                    priority: 'medium',
                    metadata: { source: 'onboarding' },
                })
                .select('id')
                .single()

            if (taskErr) {
                setTestResult(`Error creating task: ${taskErr.message}`)
                return
            }

            const taskId = (task as { id: string }).id

            // Poll for result (max 30 seconds)
            for (let i = 0; i < 30; i++) {
                await new Promise(r => setTimeout(r, 1000))

                const { data: t } = await supabase
                    .from('tasks')
                    .select('status, result')
                    .eq('id', taskId)
                    .single()

                const row = t as { status: string; result: string | null } | null
                if (row?.status === 'completed') {
                    setTestResult(row.result ?? 'Task completed (no output)')
                    return
                }
                if (row?.status === 'failed') {
                    setTestResult('Task failed — check your API key and task runner.')
                    return
                }
            }

            setTestResult('Task is still running... Check the Tasks page for the result.')
        } finally {
            setTestRunning(false)
        }
    }

    // ── Complete onboarding ──
    async function handleComplete() {
        if (!workspaceId) return
        const settings = workspace?.settings ?? {}
        await supabase
            .from('workspaces')
            .update({ settings: { ...settings, onboarding_completed: true } })
            .eq('id', workspaceId)
        void queryClient.invalidateQueries({ queryKey: ['workspace'] })
        navigate('/agents')
    }

    return (
        <div className="mx-auto max-w-2xl py-8 px-4">
            {/* Progress bar */}
            <div className="mb-8 flex items-center justify-center gap-1">
                {STEPS.map((s, i) => {
                    const Icon = s.icon
                    const isActive = i === currentIdx
                    const isDone = i < currentIdx
                    return (
                        <div key={s.key} className="flex items-center">
                            <div className={cn(
                                'flex h-8 w-8 items-center justify-center rounded-full transition-all',
                                isActive ? 'bg-brand-primary text-white' :
                                    isDone ? 'bg-emerald-500/20 text-emerald-400' :
                                        'bg-gray-800 text-gray-600',
                            )}>
                                {isDone ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                            </div>
                            {i < STEPS.length - 1 && (
                                <div className={cn(
                                    'mx-1 h-0.5 w-8 rounded-full',
                                    isDone ? 'bg-emerald-500/30' : 'bg-gray-800',
                                )} />
                            )}
                        </div>
                    )
                })}
            </div>

            {/* Step content */}
            <div className="rounded-2xl border border-border bg-surface-card p-8">
                {/* ── Step 1: Welcome ── */}
                {step === 'welcome' && (
                    <div className="text-center">
                        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-primary/10">
                            <Sparkles className="h-8 w-8 text-brand-primary" />
                        </div>
                        <h2 className="mb-2 text-xl font-semibold text-gray-100">Welcome to CrewForm</h2>
                        <p className="mb-6 text-sm text-gray-400 leading-relaxed">
                            Let&apos;s get you set up in a few quick steps. You&apos;ll configure your
                            AI provider, create your first agent, and run a test task.
                        </p>
                        <button
                            type="button"
                            onClick={() => setStep('provider')}
                            className="mx-auto flex items-center gap-2 rounded-lg bg-brand-primary px-6 py-2.5 text-sm font-medium text-white hover:bg-brand-hover"
                        >
                            Get Started
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    </div>
                )}

                {/* ── Step 2: Provider + API Key ── */}
                {step === 'provider' && (
                    <div>
                        <h2 className="mb-1 text-lg font-semibold text-gray-100">Configure Your AI Provider</h2>
                        <p className="mb-5 text-sm text-gray-500">Choose a provider and add your API key.</p>

                        <div className="mb-4 flex gap-2">
                            {PROVIDERS.map(p => (
                                <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => { setProvider(p); setKeySaved(false); setApiKey('') }}
                                    className={cn(
                                        'flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
                                        provider.id === p.id
                                            ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
                                            : 'border-border text-gray-500 hover:text-gray-400',
                                    )}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>

                        <div className="mb-4">
                            <label className="mb-1.5 block text-xs text-gray-400">API Key</label>
                            <input
                                type="password"
                                value={apiKey}
                                onChange={e => { setApiKey(e.target.value); setKeySaved(false) }}
                                placeholder={provider.placeholder}
                                className="w-full rounded-lg border border-border bg-surface-primary px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:border-brand-primary focus:outline-none"
                            />
                        </div>

                        <a
                            href={provider.id === 'openai' ? 'https://platform.openai.com/api-keys' :
                                provider.id === 'anthropic' ? 'https://console.anthropic.com/settings/keys' :
                                    'https://aistudio.google.com/apikey'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mb-5 flex items-center gap-1 text-xs text-brand-primary hover:underline"
                        >
                            <ExternalLink className="h-3 w-3" />
                            Get a {provider.label} API key
                        </a>

                        <div className="flex items-center justify-between">
                            <button
                                type="button"
                                onClick={() => setStep('welcome')}
                                className="rounded-lg border border-border px-3 py-1.5 text-xs text-gray-500 hover:text-gray-300"
                            >
                                Back
                            </button>
                            <div className="flex items-center gap-2">
                                {keySaved && <span className="flex items-center gap-1 text-xs text-emerald-400"><Check className="h-3 w-3" /> Saved</span>}
                                <button
                                    type="button"
                                    onClick={() => void handleSaveKey().then(() => setStep('agent'))}
                                    disabled={!apiKey.trim() || keySaving}
                                    className="flex items-center gap-2 rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50"
                                >
                                    {keySaving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                                    Save & Continue
                                    <ChevronRight className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Step 3: Create Agent ── */}
                {step === 'agent' && (
                    <div>
                        <h2 className="mb-1 text-lg font-semibold text-gray-100">Create Your First Agent</h2>
                        <p className="mb-5 text-sm text-gray-500">Give it a name and a system prompt to define its behavior.</p>

                        <div className="mb-4">
                            <label className="mb-1.5 block text-xs text-gray-400">Agent Name</label>
                            <input
                                type="text"
                                value={agentName}
                                onChange={e => setAgentName(e.target.value)}
                                className="w-full rounded-lg border border-border bg-surface-primary px-3 py-2 text-sm text-gray-200 focus:border-brand-primary focus:outline-none"
                            />
                        </div>

                        <div className="mb-4">
                            <label className="mb-1.5 block text-xs text-gray-400">System Prompt</label>
                            <textarea
                                value={systemPrompt}
                                onChange={e => setSystemPrompt(e.target.value)}
                                rows={3}
                                className="w-full rounded-lg border border-border bg-surface-primary px-3 py-2 text-sm text-gray-200 focus:border-brand-primary focus:outline-none resize-none"
                            />
                        </div>

                        <p className="mb-5 text-xs text-gray-600">
                            Using <strong className="text-gray-400">{provider.label}</strong> / <code className="text-gray-400">{provider.model}</code>
                        </p>

                        <div className="flex items-center justify-between">
                            <button
                                type="button"
                                onClick={() => setStep('provider')}
                                className="rounded-lg border border-border px-3 py-1.5 text-xs text-gray-500 hover:text-gray-300"
                            >
                                Back
                            </button>
                            <button
                                type="button"
                                onClick={() => void handleCreateAgent().then(() => setStep('test'))}
                                disabled={!agentName.trim() || createAgent.isPending || agentCreated}
                                className="flex items-center gap-2 rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50"
                            >
                                {createAgent.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                                {agentCreated ? 'Agent Created' : 'Create Agent'}
                                <ChevronRight className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                )}

                {/* ── Step 4: Test Run ── */}
                {step === 'test' && (
                    <div>
                        <h2 className="mb-1 text-lg font-semibold text-gray-100">Test Your Agent</h2>
                        <p className="mb-5 text-sm text-gray-500">Send a test prompt and see the result.</p>

                        <div className="mb-4">
                            <label className="mb-1.5 block text-xs text-gray-400">Test Prompt</label>
                            <input
                                type="text"
                                value={testPrompt}
                                onChange={e => setTestPrompt(e.target.value)}
                                className="w-full rounded-lg border border-border bg-surface-primary px-3 py-2 text-sm text-gray-200 focus:border-brand-primary focus:outline-none"
                            />
                        </div>

                        {testResult && (
                            <div className="mb-4 rounded-lg border border-border bg-surface-primary p-3">
                                <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-gray-500">Result</p>
                                <p className="text-sm text-gray-200 whitespace-pre-wrap">{testResult}</p>
                            </div>
                        )}

                        <div className="flex items-center justify-between">
                            <button
                                type="button"
                                onClick={() => setStep('agent')}
                                className="rounded-lg border border-border px-3 py-1.5 text-xs text-gray-500 hover:text-gray-300"
                            >
                                Back
                            </button>
                            <div className="flex items-center gap-2">
                                {testResult && (
                                    <button
                                        type="button"
                                        onClick={() => setStep('done')}
                                        className="flex items-center gap-2 rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover"
                                    >
                                        Continue
                                        <ChevronRight className="h-4 w-4" />
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => void handleTestRun()}
                                    disabled={testRunning || !testPrompt.trim()}
                                    className={cn(
                                        'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                                        testResult
                                            ? 'border border-border text-gray-400 hover:text-gray-200'
                                            : 'bg-brand-primary text-white hover:bg-brand-hover',
                                        'disabled:opacity-50',
                                    )}
                                >
                                    {testRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Rocket className="h-3 w-3" />}
                                    {testRunning ? 'Running...' : testResult ? 'Run Again' : 'Run Test'}
                                </button>
                            </div>
                        </div>

                        {!testResult && (
                            <button
                                type="button"
                                onClick={() => setStep('done')}
                                className="mt-3 w-full text-center text-xs text-gray-600 hover:text-gray-400"
                            >
                                Skip test and finish setup
                            </button>
                        )}
                    </div>
                )}

                {/* ── Step 5: Done ── */}
                {step === 'done' && (
                    <div className="text-center">
                        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10">
                            <PartyPopper className="h-8 w-8 text-emerald-400" />
                        </div>
                        <h2 className="mb-2 text-xl font-semibold text-gray-100">You&apos;re All Set!</h2>
                        <p className="mb-6 text-sm text-gray-400 leading-relaxed">
                            Your workspace is ready. You can create more agents, set up teams,
                            configure triggers, and connect messaging channels.
                        </p>
                        <button
                            type="button"
                            onClick={() => void handleComplete()}
                            className="mx-auto flex items-center gap-2 rounded-lg bg-brand-primary px-6 py-2.5 text-sm font-medium text-white hover:bg-brand-hover"
                        >
                            Go to Agents
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}
