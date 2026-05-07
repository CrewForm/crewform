// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useState } from 'react'
import {
    Globe, MessageSquare, Send, Hash, Plus, Trash2, Power, PowerOff,
    CheckCircle2, XCircle, ChevronDown, ChevronUp, Loader2, Zap, CheckSquare, Pencil, Columns3, BookOpen, Mail, Server, Layers, Table2, FileText, CalendarDays, Link2Off,
} from 'lucide-react'
import { useWorkspace } from '@/hooks/useWorkspace'
import { useWebhooks, useCreateWebhook, useUpdateWebhook, useDeleteWebhook, useWebhookLogs } from '@/hooks/useWebhooks'
import type { OutputRoute, CreateRouteInput } from '@/db/webhooks'
import { testRoute } from '@/db/webhooks'
import { useGoogleConnection, useDisconnectGoogle, useInitiateGoogleOAuth } from '@/hooks/useGoogleConnection'
import { cn } from '@/lib/utils'

// ─── Constants ──────────────────────────────────────────────────────────────

// Inline GitHub icon — lucide deprecated brand icons
function GitHubIcon({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
            <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
        </svg>
    )
}

type DestinationType = 'http' | 'slack' | 'discord' | 'telegram' | 'teams' | 'asana' | 'trello' | 'notion' | 'github' | 'email' | 'smtp' | 'linear' | 'google_sheets' | 'google_gmail' | 'google_docs' | 'google_calendar'

const DESTINATION_META: Record<DestinationType, { label: string; icon: typeof Globe; color: string; bgColor: string }> = {
    http: { label: 'HTTP Webhook', icon: Globe, color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
    slack: { label: 'Slack', icon: Hash, color: 'text-purple-400', bgColor: 'bg-purple-500/10' },
    discord: { label: 'Discord', icon: MessageSquare, color: 'text-indigo-400', bgColor: 'bg-indigo-500/10' },
    telegram: { label: 'Telegram', icon: Send, color: 'text-sky-400', bgColor: 'bg-sky-500/10' },
    teams: { label: 'Teams', icon: MessageSquare, color: 'text-violet-400', bgColor: 'bg-violet-500/10' },
    asana: { label: 'Asana', icon: CheckSquare, color: 'text-rose-400', bgColor: 'bg-rose-500/10' },
    trello: { label: 'Trello', icon: Columns3, color: 'text-teal-400', bgColor: 'bg-teal-500/10' },
    notion: { label: 'Notion', icon: BookOpen, color: 'text-gray-300', bgColor: 'bg-gray-500/10' },
    github: { label: 'GitHub Issues', icon: GitHubIcon as unknown as typeof Globe, color: 'text-gray-200', bgColor: 'bg-gray-600/10' },
    email: { label: 'Email (Resend)', icon: Mail, color: 'text-amber-400', bgColor: 'bg-amber-500/10' },
    smtp: { label: 'SMTP Email', icon: Server, color: 'text-orange-400', bgColor: 'bg-orange-500/10' },
    linear: { label: 'Linear', icon: Layers, color: 'text-violet-300', bgColor: 'bg-violet-500/10' },
    google_sheets: { label: 'Google Sheets', icon: Table2, color: 'text-green-400', bgColor: 'bg-green-500/10' },
    google_gmail: { label: 'Gmail', icon: Mail, color: 'text-red-400', bgColor: 'bg-red-500/10' },
    google_docs: { label: 'Google Docs', icon: FileText, color: 'text-blue-300', bgColor: 'bg-blue-400/10' },
    google_calendar: { label: 'Google Calendar', icon: CalendarDays, color: 'text-yellow-400', bgColor: 'bg-yellow-500/10' },
}

const EVENT_OPTIONS = [
    { value: 'task.started', label: 'Task Started' },
    { value: 'task.completed', label: 'Task Completed' },
    { value: 'task.failed', label: 'Task Failed' },
    { value: 'team_run.completed', label: 'Team Run Completed' },
    { value: 'team_run.failed', label: 'Team Run Failed' },
]

// ─── Main Component ─────────────────────────────────────────────────────────

export function WebhooksSettings() {
    const { workspaceId } = useWorkspace()
    const { data: routes, isLoading } = useWebhooks(workspaceId ?? undefined)
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
                    <h2 className="text-lg font-medium text-gray-100">Webhooks</h2>
                    <p className="mt-1 text-sm text-gray-500">
                        Get notified when tasks complete or fail.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => setShowCreateForm(true)}
                    className="flex items-center gap-2 rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-brand-primary/80"
                >
                    <Plus className="h-4 w-4" />
                    Add Webhook
                </button>
            </div>

            {/* Create Form */}
            {showCreateForm && workspaceId && (
                <CreateWebhookForm
                    workspaceId={workspaceId}
                    onClose={() => setShowCreateForm(false)}
                />
            )}

            {/* Routes List */}
            {routes && routes.length > 0 ? (
                <div className="space-y-3">
                    {routes.map((route) => (
                        <WebhookCard
                            key={route.id}
                            route={route}
                            expandedLogs={expandedLogs}
                            onToggleLogs={(id) =>
                                setExpandedLogs(expandedLogs === id ? null : id)
                            }
                        />
                    ))}
                </div>
            ) : (
                !showCreateForm && (
                    <div className="rounded-lg border border-border bg-surface-card p-8 text-center">
                        <Globe className="mx-auto mb-3 h-10 w-10 text-gray-600" />
                        <h3 className="mb-1 text-lg font-medium text-gray-300">No webhooks configured</h3>
                        <p className="text-sm text-gray-500">
                            Add a webhook to receive notifications via HTTP, Slack, Discord, or Telegram.
                        </p>
                    </div>
                )
            )}
        </div>
    )
}

// ─── Create Webhook Form ────────────────────────────────────────────────────

function CreateWebhookForm({
    workspaceId,
    onClose,
}: {
    workspaceId: string
    onClose: () => void
}) {
    const createMutation = useCreateWebhook()
    const [name, setName] = useState('')
    const [destinationType, setDestinationType] = useState<DestinationType>('http')
    const [events, setEvents] = useState<string[]>(['task.completed', 'task.failed'])
    const [config, setConfig] = useState<Record<string, string | undefined>>({})

    function toggleEvent(event: string) {
        setEvents((prev) =>
            prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event],
        )
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!name.trim() || events.length === 0) return

        const input: CreateRouteInput = {
            workspace_id: workspaceId,
            name: name.trim(),
            destination_type: destinationType,
            config,
            events,
        }

        createMutation.mutate(input, {
            onSuccess: () => {
                onClose()
            },
        })
    }

    return (
        <form
            onSubmit={handleSubmit}
            className="rounded-lg border border-border bg-surface-card p-6 space-y-4"
        >
            <h3 className="text-base font-medium text-gray-200">New Webhook</h3>

            {/* Name */}
            <div>
                <label className="mb-1 block text-sm font-medium text-gray-400">Name</label>
                <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Production alerts"
                    className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:border-brand-primary focus:outline-none"
                />
            </div>

            {/* Destination Type */}
            <div>
                <label className="mb-2 block text-sm font-medium text-gray-400">Destination</label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {(Object.keys(DESTINATION_META) as DestinationType[]).map((type) => {
                        const meta = DESTINATION_META[type]
                        const Icon = meta.icon
                        return (
                            <button
                                key={type}
                                type="button"
                                onClick={() => {
                                    setDestinationType(type)
                                    setConfig({})
                                }}
                                className={cn(
                                    'flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors',
                                    destinationType === type
                                        ? `border-brand-primary ${meta.bgColor} ${meta.color}`
                                        : 'border-border text-gray-500 hover:border-gray-600 hover:text-gray-300',
                                )}
                            >
                                <Icon className="h-4 w-4" />
                                {meta.label}
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* Config fields (dynamic by type) */}
            <DestinationConfigFields
                type={destinationType}
                config={config}
                onChange={setConfig}
            />

            {/* Events */}
            <div>
                <label className="mb-2 block text-sm font-medium text-gray-400">Events</label>
                <div className="flex flex-wrap gap-2">
                    {EVENT_OPTIONS.map((opt) => (
                        <button
                            key={opt.value}
                            type="button"
                            onClick={() => toggleEvent(opt.value)}
                            className={cn(
                                'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                                events.includes(opt.value)
                                    ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
                                    : 'border-border bg-surface-raised text-gray-500 hover:text-gray-300',
                            )}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
                <button
                    type="button"
                    onClick={onClose}
                    className="rounded-lg border border-border px-4 py-2 text-sm text-gray-400 hover:text-gray-200"
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    disabled={createMutation.isPending || !name.trim() || events.length === 0}
                    className="flex items-center gap-2 rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-brand-primary/80 disabled:opacity-50"
                >
                    {createMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <Plus className="h-4 w-4" />
                    )}
                    Create Webhook
                </button>
            </div>
        </form>
    )
}

// ─── Destination Config Fields ──────────────────────────────────────────────

function DestinationConfigFields({
    type,
    config,
    onChange,
}: {
    type: DestinationType
    config: Record<string, string | undefined>
    onChange: (c: Record<string, string | undefined>) => void
}) {
    function updateField(key: string, value: string) {
        onChange({ ...config, [key]: value })
    }

    const inputClass =
        'w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:border-brand-primary focus:outline-none'

    switch (type) {
        case 'http':
            return (
                <div className="space-y-3">
                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-400">URL</label>
                        <input
                            type="url"
                            value={config.url ?? ''}
                            onChange={(e) => updateField('url', e.target.value)}
                            placeholder="https://example.com/webhook"
                            className={inputClass}
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-400">
                            Secret <span className="text-gray-600">(optional, for HMAC signature)</span>
                        </label>
                        <input
                            type="password"
                            value={config.secret ?? ''}
                            onChange={(e) => updateField('secret', e.target.value)}
                            placeholder="whsec_..."
                            className={inputClass}
                        />
                    </div>
                </div>
            )

        case 'slack':
            return (
                <div>
                    <label className="mb-1 block text-sm font-medium text-gray-400">Slack Webhook URL</label>
                    <input
                        type="url"
                        value={config.webhook_url ?? ''}
                        onChange={(e) => updateField('webhook_url', e.target.value)}
                        placeholder="https://hooks.slack.com/services/..."
                        className={inputClass}
                    />
                </div>
            )

        case 'discord':
            return (
                <div>
                    <label className="mb-1 block text-sm font-medium text-gray-400">Discord Webhook URL</label>
                    <input
                        type="url"
                        value={config.webhook_url ?? ''}
                        onChange={(e) => updateField('webhook_url', e.target.value)}
                        placeholder="https://discord.com/api/webhooks/..."
                        className={inputClass}
                    />
                </div>
            )

        case 'telegram':
            return (
                <div className="space-y-3">
                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-400">Bot Token</label>
                        <input
                            type="password"
                            value={config.bot_token ?? ''}
                            onChange={(e) => updateField('bot_token', e.target.value)}
                            placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                            className={inputClass}
                        />
                        <p className="mt-1 text-xs text-gray-600">
                            Get this from <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline">@BotFather</a>
                        </p>
                    </div>
                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-400">Chat ID</label>
                        <input
                            type="text"
                            value={config.chat_id ?? ''}
                            onChange={(e) => updateField('chat_id', e.target.value)}
                            placeholder="-1001234567890"
                            className={inputClass}
                        />
                        <p className="mt-1 text-xs text-gray-600">
                            Use <a href="https://t.me/userinfobot" target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline">@userinfobot</a> to find your chat ID
                        </p>
                    </div>
                </div>
            )

        case 'teams':
            return (
                <div>
                    <label className="mb-1 block text-sm font-medium text-gray-400">Teams Incoming Webhook URL</label>
                    <input
                        type="url"
                        value={config.webhook_url ?? ''}
                        onChange={(e) => updateField('webhook_url', e.target.value)}
                        placeholder="https://outlook.office.com/webhook/..."
                        className={inputClass}
                    />
                    <p className="mt-1 text-xs text-gray-600">
                        Create an Incoming Webhook connector in your Teams channel settings.
                    </p>
                </div>
            )

        case 'asana':
            return (
                <div className="space-y-3">
                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-400">Personal Access Token</label>
                        <input
                            type="password"
                            value={config.pat ?? ''}
                            onChange={(e) => updateField('pat', e.target.value)}
                            placeholder="0/1234567890abcdef..."
                            className={inputClass}
                        />
                        <p className="mt-1 text-xs text-gray-600">
                            Generate one at{' '}
                            <a href="https://app.asana.com/0/developer-console" target="_blank" rel="noopener noreferrer" className="text-rose-400 hover:underline">
                                Asana Developer Console
                            </a>
                        </p>
                    </div>
                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-400">Project GID</label>
                        <input
                            type="text"
                            value={config.project_gid ?? ''}
                            onChange={(e) => updateField('project_gid', e.target.value)}
                            placeholder="1234567890123456"
                            className={inputClass}
                        />
                        <p className="mt-1 text-xs text-gray-600">
                            Find it in the URL when viewing a project: app.asana.com/0/<strong>PROJECT_GID</strong>/...
                        </p>
                    </div>
                </div>
            )

        case 'trello':
            return (
                <div className="space-y-3">
                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-400">API Key</label>
                        <input
                            type="password"
                            value={config.api_key ?? ''}
                            onChange={(e) => updateField('api_key', e.target.value)}
                            placeholder="abc123def456..."
                            className={inputClass}
                        />
                        <p className="mt-1 text-xs text-gray-600">
                            Get your key from{' '}
                            <a href="https://trello.com/power-ups/admin" target="_blank" rel="noopener noreferrer" className="text-teal-400 hover:underline">
                                Trello Power-Up Admin
                            </a>
                        </p>
                    </div>
                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-400">Token</label>
                        <input
                            type="password"
                            value={config.token ?? ''}
                            onChange={(e) => updateField('token', e.target.value)}
                            placeholder="ATTA..."
                            className={inputClass}
                        />
                        <p className="mt-1 text-xs text-gray-600">
                            Generate a token from the API key page above.
                        </p>
                    </div>
                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-400">Board ID</label>
                        <input
                            type="text"
                            value={config.board_id ?? ''}
                            onChange={(e) => updateField('board_id', e.target.value)}
                            placeholder="5f4e3d2c1b0a9..."
                            className={inputClass}
                        />
                        <p className="mt-1 text-xs text-gray-600">
                            Find it in the board URL: trello.com/b/<strong>BOARD_ID</strong>/...
                        </p>
                    </div>
                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-400">Default List ID</label>
                        <input
                            type="text"
                            value={config.list_id ?? ''}
                            onChange={(e) => updateField('list_id', e.target.value)}
                            placeholder="5f4e3d2c1b..."
                            className={inputClass}
                        />
                        <p className="mt-1 text-xs text-gray-600">
                            The list where new result cards are created. Get it from the Trello API or a browser extension.
                        </p>
                    </div>
                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-400">
                            Review List ID <span className="text-gray-600">(optional)</span>
                        </label>
                        <input
                            type="text"
                            value={config.review_list_id ?? ''}
                            onChange={(e) => updateField('review_list_id', e.target.value)}
                            placeholder="5f4e3d2c1b..."
                            className={inputClass}
                        />
                        <p className="mt-1 text-xs text-gray-600">
                            If set, completed cards are automatically moved to this list for review.
                        </p>
                    </div>
                </div>
            )

        case 'notion':
            return (
                <div className="space-y-3">
                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-400">Integration Token</label>
                        <input
                            type="password"
                            value={config.api_key ?? ''}
                            onChange={(e) => updateField('api_key', e.target.value)}
                            placeholder="secret_xxx..."
                            className={inputClass}
                        />
                        <p className="mt-1 text-xs text-gray-600">
                            Create an internal integration at{' '}
                            <a href="https://www.notion.so/my-integrations" target="_blank" rel="noopener noreferrer" className="text-gray-300 hover:underline">
                                notion.so/my-integrations
                            </a>
                            {' '}and copy the secret.
                        </p>
                    </div>
                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-400">Database ID</label>
                        <input
                            type="text"
                            value={config.database_id ?? ''}
                            onChange={(e) => updateField('database_id', e.target.value)}
                            placeholder="abc123def456..."
                            className={inputClass}
                        />
                        <p className="mt-1 text-xs text-gray-600">
                            Open the database as a full page, then copy the ID from the URL: notion.so/<strong>DATABASE_ID</strong>?v=...
                            <br />
                            <span className="text-yellow-400/70">Tip:</span> Add a &quot;Name&quot; (title), &quot;Status&quot; (select), and &quot;Agent&quot; (text) property to your database for best results.
                        </p>
                    </div>
                </div>
            )

        case 'github':
            return (
                <div className="space-y-3">
                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-400">Personal Access Token</label>
                        <input
                            type="password"
                            value={config.pat ?? ''}
                            onChange={(e) => updateField('pat', e.target.value)}
                            placeholder="ghp_xxxxxxxxxxxx"
                            className={inputClass}
                        />
                        <p className="mt-1 text-xs text-gray-600">
                            Create a{' '}
                            <a href="https://github.com/settings/tokens?type=beta" target="_blank" rel="noopener noreferrer" className="text-gray-300 hover:underline">
                                fine-grained token
                            </a>
                            {' '}with <strong>Issues: Read &amp; Write</strong> permission for the target repo.
                        </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="mb-1 block text-sm font-medium text-gray-400">Owner</label>
                            <input
                                type="text"
                                value={config.owner ?? ''}
                                onChange={(e) => updateField('owner', e.target.value)}
                                placeholder="my-org"
                                className={inputClass}
                            />
                            <p className="mt-1 text-xs text-gray-600">
                                GitHub user or organization.
                            </p>
                        </div>
                        <div>
                            <label className="mb-1 block text-sm font-medium text-gray-400">Repository</label>
                            <input
                                type="text"
                                value={config.repo ?? ''}
                                onChange={(e) => updateField('repo', e.target.value)}
                                placeholder="my-repo"
                                className={inputClass}
                            />
                        </div>
                    </div>
                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-400">
                            Labels <span className="text-gray-600">(optional, comma-separated)</span>
                        </label>
                        <input
                            type="text"
                            value={config.labels ?? ''}
                            onChange={(e) => updateField('labels', e.target.value)}
                            placeholder="ai-output, research"
                            className={inputClass}
                        />
                        <p className="mt-1 text-xs text-gray-600">
                            A &quot;crewform&quot; label is always added automatically. Failed tasks also get &quot;bug&quot;.
                        </p>
                    </div>
                </div>
            )

        case 'email':
            return (
                <div className="space-y-3">
                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-400">To Email(s)</label>
                        <input
                            type="text"
                            value={config.to ?? ''}
                            onChange={(e) => updateField('to', e.target.value)}
                            placeholder="team@company.com, alerts@company.com"
                            className={inputClass}
                        />
                        <p className="mt-1 text-xs text-gray-600">
                            Comma-separated list of recipient email addresses.
                        </p>
                    </div>
                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-400">
                            Subject Template <span className="text-gray-600">(optional)</span>
                        </label>
                        <input
                            type="text"
                            value={config.subject ?? ''}
                            onChange={(e) => updateField('subject', e.target.value)}
                            placeholder="{{status}} {{title}}"
                            className={inputClass}
                        />
                        <p className="mt-1 text-xs text-gray-600">
                            Use <code className="text-amber-400/70">{'{{title}}'}</code>, <code className="text-amber-400/70">{'{{status}}'}</code>, <code className="text-amber-400/70">{'{{agent}}'}</code> as placeholders.
                            Uses your <strong>RESEND_API_KEY</strong> env var.
                        </p>
                    </div>
                </div>
            )

        case 'smtp':
            return (
                <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                        <div className="col-span-2">
                            <label className="mb-1 block text-sm font-medium text-gray-400">SMTP Host</label>
                            <input
                                type="text"
                                value={config.host ?? ''}
                                onChange={(e) => updateField('host', e.target.value)}
                                placeholder="smtp.gmail.com"
                                className={inputClass}
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-sm font-medium text-gray-400">Port</label>
                            <input
                                type="text"
                                value={config.port ?? '587'}
                                onChange={(e) => updateField('port', e.target.value)}
                                placeholder="587"
                                className={inputClass}
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="mb-1 block text-sm font-medium text-gray-400">
                                Username <span className="text-gray-600">(optional)</span>
                            </label>
                            <input
                                type="text"
                                value={config.user ?? ''}
                                onChange={(e) => updateField('user', e.target.value)}
                                placeholder="user@gmail.com"
                                className={inputClass}
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-sm font-medium text-gray-400">
                                Password <span className="text-gray-600">(optional)</span>
                            </label>
                            <input
                                type="password"
                                value={config.pass ?? ''}
                                onChange={(e) => updateField('pass', e.target.value)}
                                placeholder="App password"
                                className={inputClass}
                            />
                        </div>
                    </div>
                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-400">From Address</label>
                        <input
                            type="text"
                            value={config.from ?? ''}
                            onChange={(e) => updateField('from', e.target.value)}
                            placeholder='CrewForm <noreply@example.com>'
                            className={inputClass}
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-400">To Email(s)</label>
                        <input
                            type="text"
                            value={config.to ?? ''}
                            onChange={(e) => updateField('to', e.target.value)}
                            placeholder="team@company.com, alerts@company.com"
                            className={inputClass}
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-400">
                            Subject Template <span className="text-gray-600">(optional)</span>
                        </label>
                        <input
                            type="text"
                            value={config.subject ?? ''}
                            onChange={(e) => updateField('subject', e.target.value)}
                            placeholder="{{status}} {{title}}"
                            className={inputClass}
                        />
                        <p className="mt-1 text-xs text-gray-600">
                            Use <code className="text-orange-400/70">{'{{title}}'}</code>, <code className="text-orange-400/70">{'{{status}}'}</code>, <code className="text-orange-400/70">{'{{agent}}'}</code> as placeholders.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            id="smtp-tls"
                            checked={(config.tls ?? 'true') !== 'false'}
                            onChange={(e) => updateField('tls', e.target.checked ? 'true' : 'false')}
                            className="h-4 w-4 rounded border-border bg-surface-raised text-brand-primary focus:ring-brand-primary"
                        />
                        <label htmlFor="smtp-tls" className="text-sm text-gray-400">Use TLS</label>
                    </div>
                </div>
            )

        case 'linear':
            return (
                <div className="space-y-3">
                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-400">API Key</label>
                        <input
                            type="password"
                            value={config.api_key ?? ''}
                            onChange={(e) => updateField('api_key', e.target.value)}
                            placeholder="lin_api_xxxxxxxxxxxx"
                            className={inputClass}
                        />
                        <p className="mt-1 text-xs text-gray-600">
                            Create one at{' '}
                            <a href="https://linear.app/settings/api" target="_blank" rel="noopener noreferrer" className="text-violet-300 hover:underline">
                                linear.app/settings/api
                            </a>
                        </p>
                    </div>
                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-400">Team ID</label>
                        <input
                            type="text"
                            value={config.team_id ?? ''}
                            onChange={(e) => updateField('team_id', e.target.value)}
                            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                            className={inputClass}
                        />
                        <p className="mt-1 text-xs text-gray-600">
                            Find it in team settings or use the Linear API to list teams.
                        </p>
                    </div>
                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-400">
                            Labels <span className="text-gray-600">(optional, comma-separated)</span>
                        </label>
                        <input
                            type="text"
                            value={config.labels ?? ''}
                            onChange={(e) => updateField('labels', e.target.value)}
                            placeholder="crewform, ai-output"
                            className={inputClass}
                        />
                        <p className="mt-1 text-xs text-gray-600">
                            Label names are matched against existing labels in your team.
                        </p>
                    </div>
                </div>
            )

        case 'google_sheets':
            return (
                <div className="space-y-3">
                    <GoogleConnectionBanner />
                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-400">Spreadsheet ID</label>
                        <input
                            type="text"
                            value={config.spreadsheet_id ?? ''}
                            onChange={(e) => updateField('spreadsheet_id', e.target.value)}
                            placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
                            className={inputClass}
                        />
                        <p className="mt-1 text-xs text-gray-600">
                            The ID from the spreadsheet URL: docs.google.com/spreadsheets/d/<strong>ID</strong>/edit
                        </p>
                    </div>
                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-400">
                            Sheet Name <span className="text-gray-600">(optional)</span>
                        </label>
                        <input
                            type="text"
                            value={config.sheet_name ?? ''}
                            onChange={(e) => updateField('sheet_name', e.target.value)}
                            placeholder="Sheet1"
                            className={inputClass}
                        />
                    </div>
                </div>
            )

        case 'google_gmail':
            return (
                <div className="space-y-3">
                    <GoogleConnectionBanner />
                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-400">To Email(s)</label>
                        <input
                            type="text"
                            value={config.to ?? ''}
                            onChange={(e) => updateField('to', e.target.value)}
                            placeholder="team@company.com, alerts@company.com"
                            className={inputClass}
                        />
                        <p className="mt-1 text-xs text-gray-600">
                            Sends from your connected Gmail account.
                        </p>
                    </div>
                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-400">
                            Subject Template <span className="text-gray-600">(optional)</span>
                        </label>
                        <input
                            type="text"
                            value={config.subject ?? ''}
                            onChange={(e) => updateField('subject', e.target.value)}
                            placeholder="{{status}} {{title}}"
                            className={inputClass}
                        />
                        <p className="mt-1 text-xs text-gray-600">
                            Use <code className="text-red-400/70">{'{{title}}'}</code>, <code className="text-red-400/70">{'{{status}}'}</code>, <code className="text-red-400/70">{'{{agent}}'}</code> as placeholders.
                        </p>
                    </div>
                </div>
            )

        case 'google_docs':
            return (
                <div className="space-y-3">
                    <GoogleConnectionBanner />
                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-400">
                            Drive Folder ID <span className="text-gray-600">(optional)</span>
                        </label>
                        <input
                            type="text"
                            value={config.folder_id ?? ''}
                            onChange={(e) => updateField('folder_id', e.target.value)}
                            placeholder="1a2B3c4D5e6F7g8H9i0J"
                            className={inputClass}
                        />
                        <p className="mt-1 text-xs text-gray-600">
                            Documents will be created in this folder. Leave empty for root.
                            Find the ID from the folder URL: drive.google.com/drive/folders/<strong>ID</strong>
                        </p>
                    </div>
                </div>
            )

        case 'google_calendar':
            return (
                <div className="space-y-3">
                    <GoogleConnectionBanner />
                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-400">
                            Calendar ID <span className="text-gray-600">(optional)</span>
                        </label>
                        <input
                            type="text"
                            value={config.calendar_id ?? ''}
                            onChange={(e) => updateField('calendar_id', e.target.value)}
                            placeholder="primary"
                            className={inputClass}
                        />
                        <p className="mt-1 text-xs text-gray-600">
                            Defaults to your primary calendar. Use a calendar ID for a specific calendar.
                        </p>
                    </div>
                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-400">
                            Duration (minutes) <span className="text-gray-600">(optional)</span>
                        </label>
                        <input
                            type="text"
                            value={config.duration_minutes ?? '30'}
                            onChange={(e) => updateField('duration_minutes', e.target.value)}
                            placeholder="30"
                            className={inputClass}
                        />
                        <p className="mt-1 text-xs text-gray-600">
                            Creates a review event 1 hour from task completion.
                        </p>
                    </div>
                </div>
            )
    }
}

/**
 * Inline banner that shows Google connection status inside Google-type config fields.
 * Shows "Connect Google" button if not connected, or connected email if connected.
 */
function GoogleConnectionBanner() {
    const { workspaceId } = useWorkspace()
    const { data: googleConn, isLoading } = useGoogleConnection(workspaceId ?? undefined)
    const disconnect = useDisconnectGoogle(workspaceId ?? undefined)
    const connectMut = useInitiateGoogleOAuth()

    if (isLoading) {
        return (
            <div className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800/50 p-3">
                <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
                <span className="text-xs text-gray-500">Checking Google connection...</span>
            </div>
        )
    }

    if (!googleConn) {
        return (
            <div className="flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                <div className="flex items-center gap-2">
                    <Link2Off className="h-4 w-4 text-amber-400" />
                    <span className="text-xs text-amber-300">Google account not connected</span>
                </div>
                <button
                    type="button"
                    onClick={() => connectMut.mutate()}
                    disabled={connectMut.isPending}
                    className="flex items-center gap-1.5 rounded-lg bg-brand-primary px-3 py-1.5 text-xs font-medium text-black hover:bg-brand-primary/90 disabled:opacity-50"
                >
                    {connectMut.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                    Connect Google
                </button>
            </div>
        )
    }

    return (
        <div className="flex items-center justify-between rounded-lg border border-green-500/30 bg-green-500/5 p-3">
            <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-400" />
                <span className="text-xs text-green-300">
                    Connected as <strong>{googleConn.google_email ?? 'Google account'}</strong>
                </span>
            </div>
            <button
                type="button"
                onClick={() => { if (confirm('Disconnect Google? All Google output routes will stop working.')) disconnect.mutate() }}
                className="text-xs text-gray-500 hover:text-red-400"
            >
                Disconnect
            </button>
        </div>
    )
}

// ─── Webhook Card ───────────────────────────────────────────────────────────

function WebhookCard({
    route,
    expandedLogs,
    onToggleLogs,
}: {
    route: OutputRoute
    expandedLogs: string | null
    onToggleLogs: (id: string) => void
}) {
    const { workspaceId } = useWorkspace()
    const updateMutation = useUpdateWebhook()
    const deleteMutation = useDeleteWebhook()
    const meta = DESTINATION_META[route.destination_type]
    const Icon = meta.icon
    const isExpanded = expandedLogs === route.id

    // ── Edit state ──────────────────────────────────────────────────────
    const [isEditing, setIsEditing] = useState(false)
    const [editName, setEditName] = useState(route.name)
    const [editConfig, setEditConfig] = useState<Record<string, string | undefined>>(route.config as Record<string, string | undefined>)
    const [editEvents, setEditEvents] = useState<string[]>(route.events)

    function openEdit() {
        setEditName(route.name)
        setEditConfig(route.config as Record<string, string | undefined>)
        setEditEvents(route.events)
        setIsEditing(true)
    }

    function toggleEditEvent(event: string) {
        setEditEvents((prev) =>
            prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event],
        )
    }

    function handleSaveEdit(e: React.FormEvent) {
        e.preventDefault()
        if (!workspaceId) return
        updateMutation.mutate(
            {
                id: route.id,
                data: {
                    name: editName,
                    config: editConfig,
                    events: editEvents,
                },
                workspaceId,
            },
            { onSuccess: () => setIsEditing(false) },
        )
    }

    function handleToggleActive() {
        if (!workspaceId) return
        updateMutation.mutate({
            id: route.id,
            data: { is_active: !route.is_active },
            workspaceId,
        })
    }

    function handleDelete() {
        if (!workspaceId) return
        if (!confirm(`Delete webhook "${route.name}"?`)) return
        deleteMutation.mutate({ id: route.id, workspaceId })
    }

    const [isTesting, setIsTesting] = useState(false)
    const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

    async function handleSendTest() {
        setIsTesting(true)
        setTestResult(null)
        try {
            const result = await testRoute(route.id)
            setTestResult({ ok: result.ok, message: result.ok ? `✓ ${result.status_code ?? 200}` : result.error ?? 'Failed' })
        } catch {
            setTestResult({ ok: false, message: 'Request failed' })
        } finally {
            setIsTesting(false)
            setTimeout(() => setTestResult(null), 4000)
        }
    }

    return (
        <div className="rounded-lg border border-border bg-surface-card">
            <div className="flex items-center gap-4 p-4">
                {/* Icon */}
                <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', meta.bgColor)}>
                    <Icon className={cn('h-5 w-5', meta.color)} />
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-200">{route.name}</span>
                        <span className={cn(
                            'rounded-full px-2 py-0.5 text-xs font-medium',
                            route.is_active
                                ? 'bg-green-500/10 text-green-400'
                                : 'bg-gray-500/10 text-gray-500',
                        )}>
                            {route.is_active ? 'Active' : 'Inactive'}
                        </span>
                    </div>
                    <p className="mt-0.5 text-xs text-gray-500">
                        {meta.label} · Events: {route.events.join(', ')}
                    </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1">
                    {testResult && (
                        <span className={cn(
                            'text-xs font-medium px-2 py-0.5 rounded-full',
                            testResult.ok ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400',
                        )}>
                            {testResult.message}
                        </span>
                    )}
                    <button
                        type="button"
                        onClick={() => void handleSendTest()}
                        disabled={isTesting}
                        title="Send test webhook"
                        className="rounded-lg p-2 text-gray-500 hover:bg-amber-500/10 hover:text-amber-400 disabled:opacity-50"
                    >
                        {isTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                    </button>
                    <button
                        type="button"
                        onClick={openEdit}
                        title="Edit webhook"
                        className="rounded-lg p-2 text-gray-500 hover:bg-brand-primary/10 hover:text-brand-primary"
                    >
                        <Pencil className="h-4 w-4" />
                    </button>
                    <button
                        type="button"
                        onClick={() => onToggleLogs(route.id)}
                        title="View delivery logs"
                        className="rounded-lg p-2 text-gray-500 hover:bg-surface-raised hover:text-gray-300"
                    >
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    <button
                        type="button"
                        onClick={handleToggleActive}
                        title={route.is_active ? 'Disable' : 'Enable'}
                        className="rounded-lg p-2 text-gray-500 hover:bg-surface-raised hover:text-gray-300"
                    >
                        {route.is_active ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                    </button>
                    <button
                        type="button"
                        onClick={handleDelete}
                        title="Delete"
                        className="rounded-lg p-2 text-gray-500 hover:bg-red-500/10 hover:text-red-400"
                    >
                        <Trash2 className="h-4 w-4" />
                    </button>
                </div>
            </div>

            {/* Edit panel */}
            {isEditing && (
                <form onSubmit={handleSaveEdit} className="border-t border-border p-4 space-y-4">
                    {/* Name */}
                    <div>
                        <label className="mb-1 block text-xs font-medium text-gray-400">Name</label>
                        <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-gray-200 focus:border-brand-primary focus:outline-none"
                        />
                    </div>

                    {/* Destination config */}
                    <DestinationConfigFields
                        type={route.destination_type}
                        config={editConfig}
                        onChange={setEditConfig}
                    />

                    {/* Events */}
                    <div>
                        <label className="mb-2 block text-xs font-medium text-gray-400">Events</label>
                        <div className="flex flex-wrap gap-2">
                            {EVENT_OPTIONS.map((opt) => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => toggleEditEvent(opt.value)}
                                    className={cn(
                                        'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                                        editEvents.includes(opt.value)
                                            ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
                                            : 'border-border bg-surface-raised text-gray-500 hover:text-gray-300',
                                    )}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Buttons */}
                    <div className="flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={() => setIsEditing(false)}
                            className="rounded-lg border border-border px-4 py-2 text-sm text-gray-400 hover:text-gray-200"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={updateMutation.isPending || !editName.trim() || editEvents.length === 0}
                            className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-black hover:bg-brand-primary/90 disabled:opacity-50"
                        >
                            {updateMutation.isPending ? 'Saving…' : 'Save Changes'}
                        </button>
                    </div>
                </form>
            )}

            {/* Logs panel */}
            {isExpanded && !isEditing && <WebhookLogsPanel routeId={route.id} />}
        </div>
    )
}

// ─── Webhook Logs Panel ─────────────────────────────────────────────────────

function WebhookLogsPanel({ routeId }: { routeId: string }) {
    const { data: logs, isLoading } = useWebhookLogs(routeId)

    if (isLoading) {
        return (
            <div className="border-t border-border p-4">
                <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
            </div>
        )
    }

    if (!logs || logs.length === 0) {
        return (
            <div className="border-t border-border p-4 text-center text-sm text-gray-500">
                No delivery logs yet.
            </div>
        )
    }

    return (
        <div className="border-t border-border">
            <div className="max-h-60 overflow-y-auto">
                {logs.map((log) => (
                    <div
                        key={log.id}
                        className="flex items-center gap-3 border-b border-border/50 px-4 py-2.5 last:border-b-0"
                    >
                        {log.status === 'success' ? (
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-green-400" />
                        ) : (
                            <XCircle className="h-4 w-4 shrink-0 text-red-400" />
                        )}
                        <span className="min-w-0 flex-1 truncate text-xs text-gray-400">
                            {log.event}
                            {log.status_code && ` · ${log.status_code}`}
                            {log.error && ` · ${log.error}`}
                        </span>
                        <span className="shrink-0 text-xs text-gray-600">
                            {new Date(log.created_at).toLocaleString()}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    )
}
