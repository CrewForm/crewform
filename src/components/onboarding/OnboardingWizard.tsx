// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useState, useCallback } from 'react'
import {
    Sparkles, Key, Bot, Rocket, PartyPopper,
    ChevronRight, Loader2, Check, ExternalLink, AlertCircle,
} from 'lucide-react'
import { useWorkspace } from '@/hooks/useWorkspace'
import { useCreateAgent } from '@/hooks/useCreateAgent'
import { useAgents } from '@/hooks/useAgents'
import { MODEL_OPTIONS, inferProviderFromModel } from '@/lib/agentSchema'
import { upsertApiKey } from '@/db/apiKeys'
import { toggleProviderActive } from '@/db/apiKeys'
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

// Include all providers (OpenRouter has empty models — user enters model name manually)
const PROVIDER_OPTIONS = MODEL_OPTIONS

// Links for getting API keys
const API_KEY_URLS: Record<string, string> = {
    anthropic: 'https://console.anthropic.com/settings/keys',
    openai: 'https://platform.openai.com/api-keys',
    google: 'https://aistudio.google.com/apikey',
    mistral: 'https://console.mistral.ai/api-keys',
    groq: 'https://console.groq.com/keys',
    cohere: 'https://dashboard.cohere.com/api-keys',
    together: 'https://api.together.xyz/settings/api-keys',
    nvidia: 'https://build.nvidia.com/explore/discover',
    'hugging face': 'https://huggingface.co/settings/tokens',
    perplexity: 'https://www.perplexity.ai/settings/api',
    minimax: 'https://www.minimaxi.com/user-center/basic-information/interface-key',
    moonshot: 'https://platform.moonshot.cn/console/api-keys',
    venice: 'https://venice.ai/settings/api-keys',
}

// ─── Component ──────────────────────────────────────────────────────────────

export function OnboardingWizard() {
    const { workspaceId, workspace } = useWorkspace()
    const { agents } = useAgents(workspaceId)
    const createAgent = useCreateAgent()
    const navigate = useNavigate()
    const queryClient = useQueryClient()

    const [step, setStep] = useState<StepKey>('welcome')
    const [selectedProvider, setSelectedProvider] = useState(PROVIDER_OPTIONS[0])
    const [selectedModel, setSelectedModel] = useState(PROVIDER_OPTIONS[0].models[0]?.value ?? '')
    const [customModel, setCustomModel] = useState('')
    const [apiKey, setApiKey] = useState('')
    const [keySaved, setKeySaved] = useState(false)
    const [keySaving, setKeySaving] = useState(false)
    const [agentName, setAgentName] = useState('My First Agent')
    const [systemPrompt, setSystemPrompt] = useState('You are a helpful assistant. Be concise and accurate.')
    const [agentCreated, setAgentCreated] = useState(false)
    const [testPrompt, setTestPrompt] = useState('What is 2 + 2? Answer in one sentence.')
    const [testResult, setTestResult] = useState<string | null>(null)
    const [testRunning, setTestRunning] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)

    const currentIdx = STEPS.findIndex(s => s.key === step)

    const providerKey = selectedProvider.provider.toLowerCase()
    const apiKeyUrl = API_KEY_URLS[providerKey]
    const hasModels = selectedProvider.models.length > 0
    const resolvedModel = hasModels ? selectedModel : customModel.trim()

    // ── Change provider ──
    const handleProviderChange = useCallback((providerId: string) => {
        const group = PROVIDER_OPTIONS.find(g => g.provider === providerId)
        if (!group) return
        setSelectedProvider(group)
        setSelectedModel(group.models[0]?.value ?? '')
        setCustomModel('')
        setKeySaved(false)
        setApiKey('')
        setError(null)
    }, [])

    // ── Save API key to api_keys table ──
    async function handleSaveKey() {
        if (!workspaceId || !apiKey.trim()) return
        setKeySaving(true)
        setError(null)
        try {
            const trimmedKey = apiKey.trim()
            const hint = trimmedKey.slice(-4)

            // Upsert the key into the api_keys table
            const saved = await upsertApiKey({
                workspace_id: workspaceId,
                provider: providerKey,
                encrypted_key: trimmedKey,
                key_hint: hint,
                is_valid: true,
            })

            // Mark the provider as active
            await toggleProviderActive(saved.id, true)

            void queryClient.invalidateQueries({ queryKey: ['apiKeys', workspaceId] })
            setKeySaved(true)
            setStep('agent')
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to save API key')
        } finally {
            setKeySaving(false)
        }
    }

    // ── Create the first agent ──
    async function handleCreateAgent() {
        if (!workspaceId) return
        setSaving(true)
        setError(null)
        try {
            await createAgent.mutateAsync({
                workspace_id: workspaceId,
                name: agentName,
                description: 'Created during onboarding',
                model: resolvedModel,
                provider: hasModels ? inferProviderFromModel(resolvedModel) : providerKey,
                system_prompt: systemPrompt,
                temperature: 0.7,
                max_tokens: null,
                tags: [],
                tools: [],
                fallback_model: null,
            })
            setAgentCreated(true)
            setStep('test')
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to create agent')
        } finally {
            setSaving(false)
        }
    }

    // ── Test run ──
    async function handleTestRun() {
        if (!workspaceId) return
        setTestRunning(true)
        setTestResult(null)
        setError(null)

        try {
            const agent = agents[0] as typeof agents[number] | undefined
            if (!agent) {
                setError('No agent found — please go back and create one first.')
                return
            }

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
                setError(`Error creating task: ${taskErr.message}`)
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
                    setTestResult('Task failed — check your API key and ensure the task runner is running.')
                    return
                }
            }

            setTestResult('Task is still running... Check the Tasks page for the result.')
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Test run failed')
        } finally {
            setTestRunning(false)
        }
    }

    // ── Complete onboarding ──
    async function handleComplete() {
        if (!workspaceId) return
        try {
            const settings = workspace?.settings ?? {}
            await supabase
                .from('workspaces')
                .update({ settings: { ...settings, onboarding_completed: true } })
                .eq('id', workspaceId)
            void queryClient.invalidateQueries({ queryKey: ['workspace'] })
            navigate('/agents')
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to complete setup')
        }
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

            {/* Error banner */}
            {error && (
                <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3">
                    <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-400" />
                    <p className="text-sm text-red-400">{error}</p>
                </div>
            )}

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
                            AI provider, create your first agent, and optionally run a test task.
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

                        {/* Provider selector */}
                        <div className="mb-4">
                            <label className="mb-1.5 block text-xs text-gray-400">Provider</label>
                            <select
                                value={selectedProvider.provider}
                                onChange={e => handleProviderChange(e.target.value)}
                                className="w-full rounded-lg border border-border bg-surface-primary px-3 py-2 text-sm text-gray-200 focus:border-brand-primary focus:outline-none"
                            >
                                {PROVIDER_OPTIONS.map(g => (
                                    <option key={g.provider} value={g.provider}>{g.provider}</option>
                                ))}
                            </select>
                        </div>

                        {/* API key input */}
                        <div className="mb-4">
                            <label className="mb-1.5 block text-xs text-gray-400">API Key</label>
                            <input
                                type="password"
                                value={apiKey}
                                onChange={e => { setApiKey(e.target.value); setKeySaved(false); setError(null) }}
                                placeholder="Paste your API key here..."
                                className="w-full rounded-lg border border-border bg-surface-primary px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:border-brand-primary focus:outline-none"
                            />
                        </div>

                        {apiKeyUrl && (
                            <a
                                href={apiKeyUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mb-5 flex items-center gap-1 text-xs text-brand-primary hover:underline"
                            >
                                <ExternalLink className="h-3 w-3" />
                                Get a {selectedProvider.provider} API key
                            </a>
                        )}

                        <div className="flex items-center justify-between">
                            <button
                                type="button"
                                onClick={() => { setStep('welcome'); setError(null) }}
                                className="rounded-lg border border-border px-3 py-1.5 text-xs text-gray-500 hover:text-gray-300"
                            >
                                Back
                            </button>
                            <div className="flex items-center gap-2">
                                {keySaved && <span className="flex items-center gap-1 text-xs text-emerald-400"><Check className="h-3 w-3" /> Saved</span>}
                                <button
                                    type="button"
                                    onClick={() => void handleSaveKey()}
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
                        <p className="mb-5 text-sm text-gray-500">Give it a name, select a model, and define its behavior.</p>

                        <div className="mb-4">
                            <label className="mb-1.5 block text-xs text-gray-400">Agent Name</label>
                            <input
                                type="text"
                                value={agentName}
                                onChange={e => setAgentName(e.target.value)}
                                className="w-full rounded-lg border border-border bg-surface-primary px-3 py-2 text-sm text-gray-200 focus:border-brand-primary focus:outline-none"
                            />
                        </div>

                        {/* Model selector */}
                        <div className="mb-4">
                            <label className="mb-1.5 block text-xs text-gray-400">Model</label>
                            {hasModels ? (
                                <select
                                    value={selectedModel}
                                    onChange={e => setSelectedModel(e.target.value)}
                                    className="w-full rounded-lg border border-border bg-surface-primary px-3 py-2 text-sm text-gray-200 focus:border-brand-primary focus:outline-none"
                                >
                                    {selectedProvider.models.map(m => (
                                        <option key={m.value} value={m.value}>{m.label}</option>
                                    ))}
                                </select>
                            ) : (
                                <input
                                    type="text"
                                    value={customModel}
                                    onChange={e => setCustomModel(e.target.value)}
                                    placeholder="e.g. openrouter/anthropic/claude-sonnet-4"
                                    className="w-full rounded-lg border border-border bg-surface-primary px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:border-brand-primary focus:outline-none"
                                />
                            )}
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
                            Using <strong className="text-gray-400">{selectedProvider.provider}</strong> / <code className="text-gray-400">{resolvedModel || '(enter model name)'}</code>
                        </p>

                        <div className="flex items-center justify-between">
                            <button
                                type="button"
                                onClick={() => { setStep('provider'); setError(null) }}
                                className="rounded-lg border border-border px-3 py-1.5 text-xs text-gray-500 hover:text-gray-300"
                            >
                                Back
                            </button>
                            <button
                                type="button"
                                onClick={() => void handleCreateAgent()}
                                disabled={!agentName.trim() || !resolvedModel || saving || agentCreated}
                                className="flex items-center gap-2 rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50"
                            >
                                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
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
                        <p className="mb-5 text-sm text-gray-500">Send a test prompt to see it in action, or skip to finish setup.</p>

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
                                onClick={() => { setStep('agent'); setError(null) }}
                                className="rounded-lg border border-border px-3 py-1.5 text-xs text-gray-500 hover:text-gray-300"
                            >
                                Back
                            </button>
                            <div className="flex items-center gap-2">
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
                                <button
                                    type="button"
                                    onClick={() => setStep('done')}
                                    className="flex items-center gap-2 rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover"
                                >
                                    {testResult ? 'Continue' : 'Skip & Finish'}
                                    <ChevronRight className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
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
