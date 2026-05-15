// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useState } from 'react'
import {
    Send, MessageSquare, Hash, Mail, Plus, Trash2, Power, PowerOff,
    Loader2, ChevronDown, ChevronUp, ExternalLink, ArrowDownLeft, ArrowUpRight,
    Copy, Check, Link2, Columns3, Layers,
} from 'lucide-react'
import { useWorkspace } from '@/hooks/useWorkspace'
import {
    useMessagingChannels,
    useCreateChannel,
    useUpdateChannel,
    useDeleteChannel,
    useChannelLogs,
} from '@/hooks/useMessagingChannels'
import type { ChannelPlatform, CreateChannelInput, MessagingChannel } from '@/db/messagingChannels'
import { useAgents } from '@/hooks/useAgents'
import { useTeams } from '@/hooks/useTeams'
import { cn } from '@/lib/utils'

// ─── Constants ──────────────────────────────────────────────────────────────

const PLATFORM_META: Record<ChannelPlatform, {
    label: string
    icon: typeof Send
    color: string
    bgColor: string
    setupGuide: string
    inviteUrl?: string
    connectCommand: string
    configFields: { key: string; label: string; type: 'text' | 'password'; placeholder: string; required: boolean }[]
}> = {
    telegram: {
        label: 'Telegram',
        icon: Send,
        color: 'text-sky-400',
        bgColor: 'bg-sky-500/10',
        setupGuide: 'https://core.telegram.org/bots#botfather',
        connectCommand: '/connect',
        configFields: [
            { key: 'bot_token', label: 'Bot Token', type: 'password', placeholder: '123456:ABC-DEF...', required: true },
            { key: 'chat_id', label: 'Chat ID', type: 'text', placeholder: '-100123456789', required: true },
        ],
    },
    discord: {
        label: 'Discord',
        icon: MessageSquare,
        color: 'text-indigo-400',
        bgColor: 'bg-indigo-500/10',
        setupGuide: 'https://discord.com/developers/applications',
        inviteUrl: 'https://discord.com/api/oauth2/authorize?client_id=1477979971967385673&permissions=2048&scope=bot%20applications.commands',
        connectCommand: '/connect code:',
        configFields: [
            { key: 'bot_token', label: 'Bot Token', type: 'password', placeholder: 'MTIz...', required: true },
            { key: 'guild_id', label: 'Server (Guild) ID', type: 'text', placeholder: '123456789012345678', required: true },
            { key: 'channel_id', label: 'Channel ID', type: 'text', placeholder: '123456789012345678', required: false },
        ],
    },
    slack: {
        label: 'Slack',
        icon: Hash,
        color: 'text-purple-400',
        bgColor: 'bg-purple-500/10',
        setupGuide: 'https://api.slack.com/apps',
        connectCommand: 'connect',
        configFields: [
            { key: 'bot_token', label: 'Bot Token (xoxb-...)', type: 'password', placeholder: 'xoxb-...', required: true },
            { key: 'signing_secret', label: 'Signing Secret', type: 'password', placeholder: 'abc123...', required: true },
            { key: 'channel_id', label: 'Channel ID', type: 'text', placeholder: 'C0123456789', required: true },
        ],
    },
    email: {
        label: 'Email',
        icon: Mail,
        color: 'text-amber-400',
        bgColor: 'bg-amber-500/10',
        setupGuide: 'https://resend.com/docs/dashboard/webhooks/introduction',
        connectCommand: '',
        configFields: [
            { key: 'inbound_address', label: 'Inbound Email Address', type: 'text', placeholder: 'agent@inbound.crewform.tech', required: true },
        ],
    },
    trello: {
        label: 'Trello',
        icon: Columns3,
        color: 'text-teal-400',
        bgColor: 'bg-teal-500/10',
        setupGuide: 'https://trello.com/power-ups/admin',
        connectCommand: '',
        configFields: [
            { key: 'api_key', label: 'API Key', type: 'password', placeholder: 'abc123def456...', required: true },
            { key: 'token', label: 'Token', type: 'password', placeholder: 'ATTA...', required: true },
            { key: 'board_id', label: 'Board ID', type: 'text', placeholder: '5f4e3d2c1b0a9...', required: true },
            { key: 'trigger_list_id', label: 'Trigger List ID (cards moved here trigger agents)', type: 'text', placeholder: '5f4e3d2c1b...', required: true },
            { key: 'review_list_id', label: 'Review List ID (completed cards move here)', type: 'text', placeholder: '5f4e3d2c1b...', required: false },
        ],
    },
    linear: {
        label: 'Linear',
        icon: Layers,
        color: 'text-violet-300',
        bgColor: 'bg-violet-500/10',
        setupGuide: 'https://linear.app/settings/api',
        connectCommand: '',
        configFields: [
            { key: 'api_key', label: 'Personal API Key', type: 'password', placeholder: 'lin_api_...', required: true },
            { key: 'linear_team_id', label: 'Team ID', type: 'text', placeholder: 'Team UUID from Linear settings', required: true },
            { key: 'trigger_on', label: 'Trigger On (comma-separated: create, state_change, label)', type: 'text', placeholder: 'create,state_change', required: true },
            { key: 'trigger_states', label: 'Trigger States (comma-separated, e.g. Triage,Todo)', type: 'text', placeholder: 'Triage,Todo', required: false },
            { key: 'trigger_labels', label: 'Trigger Labels (comma-separated)', type: 'text', placeholder: 'crewform,ai-task', required: false },
            { key: 'done_state_name', label: 'Done State (move issue here on completion)', type: 'text', placeholder: 'Done', required: false },
        ],
    },
}

function generateConnectCode(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
    let code = 'crw_'
    for (let i = 0; i < 8; i++) {
        code += chars[Math.floor(Math.random() * chars.length)]
    }
    return code
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function MessagingChannelsSettings() {
    const { workspaceId } = useWorkspace()
    const { data: channels, isLoading } = useMessagingChannels(workspaceId ?? undefined)
    const [showCreateForm, setShowCreateForm] = useState(false)
    const [expandedLogs, setExpandedLogs] = useState<string | null>(null)

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-medium text-gray-100">Messaging Channels</h2>
                    <p className="mt-1 text-sm text-gray-500">
                        Send messages from Telegram, Discord, Slack, Email, Trello, or Linear to trigger your agents.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => setShowCreateForm(true)}
                    className="flex items-center gap-2 rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-black hover:bg-brand-primary/90"
                >
                    <Plus className="h-4 w-4" />
                    Add Channel
                </button>
            </div>

            {/* Create Form */}
            {showCreateForm && workspaceId && (
                <CreateChannelForm
                    workspaceId={workspaceId}
                    onClose={() => setShowCreateForm(false)}
                />
            )}

            {/* Channel List */}
            {!channels || channels.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-700 p-8 text-center">
                    <MessageSquare className="mx-auto mb-3 h-8 w-8 text-gray-600" />
                    <p className="text-sm text-gray-500">
                        No messaging channels configured yet.
                    </p>
                    <p className="mt-1 text-xs text-gray-600">
                        Connect a platform to start sending prompts to your agents from any messaging app.
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {channels.map(channel => (
                        <ChannelCard
                            key={channel.id}
                            channel={channel}
                            isExpanded={expandedLogs === channel.id}
                            onToggleLogs={() => setExpandedLogs(expandedLogs === channel.id ? null : channel.id)}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}

// ─── Create Form ────────────────────────────────────────────────────────────

function CreateChannelForm({ workspaceId, onClose }: { workspaceId: string; onClose: () => void }) {
    const [platform, setPlatform] = useState<ChannelPlatform>('telegram')
    const [name, setName] = useState('')
    const [config, setConfig] = useState<Record<string, string>>({})
    const [isManaged, setIsManaged] = useState(true)
    const [routeType, setRouteType] = useState<'agent' | 'team'>('agent')
    const [selectedId, setSelectedId] = useState('')
    const [linearStatus, setLinearStatus] = useState<string | null>(null)
    const createChannel = useCreateChannel()
    const updateChannel = useUpdateChannel(workspaceId)
    const { agents } = useAgents(workspaceId)
    const { teams } = useTeams(workspaceId)

    const meta = PLATFORM_META[platform]
    const isEmail = platform === 'email'
    const isTrello = platform === 'trello'
    const isLinear = platform === 'linear'
    const skipManaged = isEmail || isTrello || isLinear

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedId) return

        // For Linear, parse comma-separated fields into arrays
        let resolvedConfig: Record<string, unknown> = isManaged && !skipManaged ? {} : { ...config }
        if (isLinear) {
            const csvToArray = (val: string | undefined): string[] =>
                val ? val.split(',').map(s => s.trim()).filter(Boolean) : []
            resolvedConfig = {
                ...config,
                trigger_on: csvToArray(config.trigger_on),
                trigger_states: csvToArray(config.trigger_states),
                trigger_labels: csvToArray(config.trigger_labels),
            }
        }

        const input: CreateChannelInput = {
            workspace_id: workspaceId,
            platform,
            name: name || `${meta.label} Channel`,
            config: resolvedConfig,
            is_managed: isManaged && !skipManaged,
            connect_code: isManaged && !skipManaged ? generateConnectCode() : undefined,
            default_agent_id: routeType === 'agent' ? selectedId : undefined,
            default_team_id: routeType === 'team' ? selectedId : undefined,
        }
        createChannel.mutate(input, {
            onSuccess: (channel) => {
                // For Linear channels, auto-register the webhook
                if (isLinear && config.api_key && config.linear_team_id) {
                    setLinearStatus('Registering Linear webhook…')
                    void (async () => {
                        try {
                            const { supabase } = await import('@/lib/supabase')
                            const resp: { data: { webhook_id: string; webhook_secret: string; callback_url: string } | null; error: { message: string } | null } =
                                await supabase.functions.invoke('linear-webhook-register', {
                                    body: {
                                        api_key: config.api_key,
                                        team_id: config.linear_team_id,
                                    },
                                })

                            if (resp.error) {
                                console.error('[Linear] Webhook registration failed:', resp.error.message)
                                setLinearStatus('⚠ Webhook registration failed — you can set it up manually in Linear.')
                                setTimeout(onClose, 3000)
                                return
                            }

                            const result = resp.data
                            if (result) {
                                // Update channel config with webhook secret
                                updateChannel.mutate({
                                    id: channel.id,
                                    input: {
                                        config: {
                                            ...resolvedConfig,
                                            webhook_secret: result.webhook_secret,
                                            webhook_id: result.webhook_id,
                                        },
                                    },
                                })
                            }

                            setLinearStatus('✓ Webhook registered — Linear issues will now trigger your agent.')
                            setTimeout(onClose, 2000)
                        } catch (err) {
                            console.error('[Linear] Webhook registration error:', err)
                            setLinearStatus('⚠ Channel created but webhook registration failed. Set up the webhook manually.')
                            setTimeout(onClose, 3000)
                        }
                    })()
                } else {
                    onClose()
                }
            },
        })
    }

    return (
        <form
            onSubmit={handleSubmit}
            className="rounded-xl border border-gray-700 bg-gray-800/50 p-5 space-y-4"
        >
            <h3 className="text-sm font-medium text-gray-200">New Messaging Channel</h3>

            {/* Platform selector */}
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {(Object.keys(PLATFORM_META) as ChannelPlatform[]).map(p => {
                    const m = PLATFORM_META[p]
                    const Icon = m.icon
                    return (
                        <button
                            key={p}
                            type="button"
                            onClick={() => { setPlatform(p); setConfig({}); setIsManaged(true) }}
                            className={cn(
                                'flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2.5 text-xs font-medium transition-colors',
                                platform === p
                                    ? `border-gray-500 ${m.bgColor} ${m.color}`
                                    : 'border-gray-700 text-gray-500 hover:border-gray-600 hover:text-gray-400',
                            )}
                        >
                            <Icon className="h-4 w-4 shrink-0" />
                            {m.label}
                        </button>
                    )
                })}
            </div>

            {/* Name */}
            <div>
                <label className="mb-1 block text-xs text-gray-400">Channel Name</label>
                <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder={`My ${meta.label} Channel`}
                    className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:border-brand-primary focus:outline-none"
                />
            </div>

            {/* Route To (Agent or Team) */}
            <div>
                <label className="mb-1 block text-xs text-gray-400">Route messages to</label>
                <div className="flex gap-2 mb-2">
                    <button
                        type="button"
                        onClick={() => { setRouteType('agent'); setSelectedId('') }}
                        className={cn(
                            'flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                            routeType === 'agent' ? 'bg-brand-primary/10 text-brand-primary' : 'text-gray-500 hover:text-gray-400',
                        )}
                    >
                        Agent
                    </button>
                    <button
                        type="button"
                        onClick={() => { setRouteType('team'); setSelectedId('') }}
                        className={cn(
                            'flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                            routeType === 'team' ? 'bg-brand-primary/10 text-brand-primary' : 'text-gray-500 hover:text-gray-400',
                        )}
                    >
                        Team
                    </button>
                </div>
                <select
                    value={selectedId}
                    onChange={e => setSelectedId(e.target.value)}
                    required
                    className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-brand-primary focus:outline-none"
                >
                    <option value="">Select {routeType === 'agent' ? 'an agent' : 'a team'}...</option>
                    {routeType === 'agent'
                        ? agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)
                        : teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)
                    }
                </select>
            </div>

            {/* Managed vs BYOB toggle (not for email or trello) */}
            {!skipManaged && (
                <div className="flex items-center gap-3 rounded-lg border border-gray-700 p-3">
                    <button
                        type="button"
                        onClick={() => setIsManaged(true)}
                        className={cn(
                            'flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors',
                            isManaged ? 'bg-brand-primary/10 text-brand-primary' : 'text-gray-500 hover:text-gray-400',
                        )}
                    >
                        CrewForm Bot (recommended)
                    </button>
                    <button
                        type="button"
                        onClick={() => setIsManaged(false)}
                        className={cn(
                            'flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors',
                            !isManaged ? 'bg-brand-primary/10 text-brand-primary' : 'text-gray-500 hover:text-gray-400',
                        )}
                    >
                        Use Your Own Bot
                    </button>
                </div>
            )}

            {/* Managed mode info */}
            {isManaged && !skipManaged && (
                <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-3 space-y-2">
                    {meta.inviteUrl && (
                        <p className="text-xs text-gray-400">
                            <strong className="text-gray-300">Step 1:</strong>{' '}
                            <a
                                href={meta.inviteUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-brand-primary underline hover:text-brand-primary/80"
                            >
                                Invite the CrewForm bot to your server
                            </a>
                        </p>
                    )}
                    <p className="text-xs text-gray-400">
                        {meta.inviteUrl && <><strong className="text-gray-300">Step 2:</strong>{' '}</>}
                        After creating this channel, you&apos;ll get a <strong className="text-gray-300">connect code</strong>.
                        Send <code className="rounded bg-gray-800 px-1 text-brand-primary">{meta.connectCommand} &lt;code&gt;</code> in your
                        {' '}{meta.label} chat to link it to this agent.
                    </p>
                </div>
            )}

            {/* BYOB config fields */}
            {!isManaged && !skipManaged && meta.configFields.map(field => (
                <div key={field.key}>
                    <label className="mb-1 block text-xs text-gray-400">{field.label}</label>
                    <input
                        type={field.type}
                        value={config[field.key] ?? ''}
                        onChange={e => setConfig({ ...config, [field.key]: e.target.value })}
                        placeholder={field.placeholder}
                        required={field.required}
                        className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:border-brand-primary focus:outline-none"
                    />
                </div>
            ))}

            {/* Platforms that always show config (email, trello) */}
            {skipManaged && meta.configFields.map(field => (
                <div key={field.key}>
                    <label className="mb-1 block text-xs text-gray-400">{field.label}</label>
                    <input
                        type={field.type}
                        value={config[field.key] ?? ''}
                        onChange={e => setConfig({ ...config, [field.key]: e.target.value })}
                        placeholder={field.placeholder}
                        required={field.required}
                        className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:border-brand-primary focus:outline-none"
                    />
                </div>
            ))}

            {/* Setup guide link (BYOB only) */}
            {!isManaged && !skipManaged && (
                <a
                    href={meta.setupGuide}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-brand-primary hover:underline"
                >
                    <ExternalLink className="h-3 w-3" />
                    How to set up a {meta.label} bot
                </a>
            )}

            {/* Linear webhook registration status */}
            {linearStatus && (
                <div className={cn(
                    'rounded-lg border p-3 text-xs',
                    linearStatus.startsWith('✓')
                        ? 'border-emerald-700 bg-emerald-500/10 text-emerald-400'
                        : linearStatus.startsWith('⚠')
                            ? 'border-amber-700 bg-amber-500/10 text-amber-400'
                            : 'border-gray-700 bg-gray-900/50 text-gray-400',
                )}>
                    {linearStatus.includes('Registering') && <Loader2 className="mr-1.5 inline-block h-3 w-3 animate-spin" />}
                    {linearStatus}
                </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-2">
                <button
                    type="button"
                    onClick={onClose}
                    className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-400 hover:border-gray-600"
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    disabled={createChannel.isPending || !!linearStatus}
                    className="flex items-center gap-2 rounded-lg bg-brand-primary px-4 py-1.5 text-sm font-medium text-black hover:bg-brand-primary/90 disabled:opacity-50"
                >
                    {(createChannel.isPending || linearStatus?.includes('Registering')) && <Loader2 className="h-3 w-3 animate-spin" />}
                    Create Channel
                </button>
            </div>
        </form>
    )
}

// ─── Channel Card ───────────────────────────────────────────────────────────

function ChannelCard({
    channel,
    isExpanded,
    onToggleLogs,
}: {
    channel: MessagingChannel
    isExpanded: boolean
    onToggleLogs: () => void
}) {
    const { workspaceId } = useWorkspace()
    const updateChannel = useUpdateChannel(workspaceId ?? undefined)
    const deleteChannelMut = useDeleteChannel(workspaceId ?? undefined)
    const { data: logs } = useChannelLogs(isExpanded ? channel.id : undefined)
    const [copied, setCopied] = useState(false)

    const meta = PLATFORM_META[channel.platform]
    const Icon = meta.icon
    const isLinked = !!channel.platform_chat_id

    const copyConnectCommand = () => {
        if (!channel.connect_code) return
        const cmd = `${meta.connectCommand} ${channel.connect_code}`
        void navigator.clipboard.writeText(cmd)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    return (
        <div className="rounded-xl border border-gray-700 bg-gray-800/30 overflow-hidden">
            <div className="flex items-center gap-3 p-4">
                {/* Icon */}
                <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', meta.bgColor)}>
                    <Icon className={cn('h-4 w-4', meta.color)} />
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-200 truncate">{channel.name}</span>
                        {channel.is_managed && (
                            <span className="rounded-full bg-brand-primary/10 px-2 py-0.5 text-[10px] font-medium text-brand-primary">
                                Managed
                            </span>
                        )}
                        <span className={cn(
                            'rounded-full px-2 py-0.5 text-[10px] font-medium',
                            channel.is_active
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : 'bg-gray-700 text-gray-500',
                        )}>
                            {channel.is_active ? 'Active' : 'Inactive'}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <p className="text-xs text-gray-500">{meta.label}</p>
                        {channel.is_managed && (
                            <span className={cn(
                                'flex items-center gap-1 text-[10px]',
                                isLinked ? 'text-emerald-500' : 'text-amber-500',
                            )}>
                                <Link2 className="h-2.5 w-2.5" />
                                {isLinked ? 'Connected' : 'Awaiting connection'}
                            </span>
                        )}
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1">
                    <button
                        type="button"
                        onClick={() => updateChannel.mutate({ id: channel.id, input: { is_active: !channel.is_active } })}
                        className="rounded-lg p-2 text-gray-500 hover:bg-gray-700 hover:text-gray-300"
                        title={channel.is_active ? 'Disable' : 'Enable'}
                    >
                        {channel.is_active ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                    </button>
                    <button
                        type="button"
                        onClick={onToggleLogs}
                        className="rounded-lg p-2 text-gray-500 hover:bg-gray-700 hover:text-gray-300"
                        title="Message Log"
                    >
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            if (confirm('Delete this messaging channel?')) {
                                deleteChannelMut.mutate(channel.id)
                            }
                        }}
                        className="rounded-lg p-2 text-gray-500 hover:bg-red-500/10 hover:text-red-400"
                        title="Delete"
                    >
                        <Trash2 className="h-4 w-4" />
                    </button>
                </div>
            </div>

            {/* Connect Code Banner (managed + not yet linked) */}
            {channel.is_managed && channel.connect_code && !isLinked && (
                <div className="border-t border-gray-700 bg-amber-500/5 p-3">
                    {meta.inviteUrl && (
                        <p className="mb-2 text-xs text-gray-400">
                            <strong className="text-gray-300">Step 1:</strong>{' '}
                            <a
                                href={meta.inviteUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-brand-primary underline hover:text-brand-primary/80"
                            >
                                Invite the CrewForm bot to your server
                            </a>
                            {' '}(if you haven&apos;t already)
                        </p>
                    )}
                    <p className="mb-2 text-xs text-amber-400">
                        {meta.inviteUrl && <><strong>Step 2:</strong>{' '}</>}
                        Send this command in your {meta.label} chat to connect:
                    </p>
                    <div className="flex items-center gap-2">
                        <code className="flex-1 rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-mono text-gray-200">
                            {meta.connectCommand} {channel.connect_code}
                        </code>
                        <button
                            type="button"
                            onClick={copyConnectCommand}
                            className="rounded-lg bg-gray-800 p-1.5 text-gray-400 hover:text-gray-200"
                            title="Copy command"
                        >
                            {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                        </button>
                    </div>
                </div>
            )}

            {/* Message Log */}
            {isExpanded && (
                <div className="border-t border-gray-700 bg-gray-900/30 p-4">
                    <h4 className="mb-2 text-xs font-medium text-gray-400">Recent Messages</h4>
                    {!logs || logs.length === 0 ? (
                        <p className="text-xs text-gray-600">No messages yet.</p>
                    ) : (
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                            {logs.map(log => (
                                <div
                                    key={log.id}
                                    className="flex items-start gap-2 rounded-lg bg-gray-800/50 p-2.5 text-xs"
                                >
                                    {log.direction === 'inbound' ? (
                                        <ArrowDownLeft className="mt-0.5 h-3 w-3 shrink-0 text-blue-400" />
                                    ) : (
                                        <ArrowUpRight className="mt-0.5 h-3 w-3 shrink-0 text-emerald-400" />
                                    )}
                                    <div className="min-w-0 flex-1">
                                        <p className="text-gray-300 truncate">{log.message_preview ?? '—'}</p>
                                        {log.error && (
                                            <p className="mt-0.5 text-red-400 truncate">{log.error}</p>
                                        )}
                                    </div>
                                    <span className="shrink-0 text-gray-600">
                                        {new Date(log.created_at).toLocaleTimeString()}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
