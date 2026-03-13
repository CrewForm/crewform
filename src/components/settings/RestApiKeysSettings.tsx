// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useState } from 'react'
import { Copy, Check, Key, Plus, Trash2, Clock, Shield } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useRestApiKeys, useCreateRestApiKey, useDeleteRestApiKey } from '@/hooks/useRestApiKeys'
import { Skeleton } from '@/components/ui/skeleton'
import { getApiUrl } from '@/lib/apiUrl'

/**
 * REST API Keys management section.
 * Allows users to generate, view, and revoke REST API keys
 * used for external integrations (Zapier, custom scripts, etc.)
 */
export function RestApiKeysSettings() {
    const { user } = useAuth()
    const { data: keys, isLoading } = useRestApiKeys()
    const createKey = useCreateRestApiKey()
    const deleteKey = useDeleteRestApiKey()

    const [newKeyName, setNewKeyName] = useState('')
    const [showNewKey, setShowNewKey] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)
    const [copiedUrl, setCopiedUrl] = useState(false)
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

    const apiUrl = `${getApiUrl()}/functions/v1`

    const handleCreate = async () => {
        if (!newKeyName.trim() || !user) return

        try {
            const result = await createKey.mutateAsync({
                name: newKeyName.trim(),
                userId: user.id,
            })
            setShowNewKey(result.rawKey)
            setNewKeyName('')
        } catch (err) {
            console.error('Failed to create API key', err)
        }
    }

    const handleCopy = async (key: string) => {
        await navigator.clipboard.writeText(key)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    const handleDelete = async (id: string) => {
        try {
            await deleteKey.mutateAsync(id)
            setConfirmDeleteId(null)
        } catch (err) {
            console.error('Failed to revoke API key', err)
        }
    }

    const formatDate = (iso: string | null) => {
        if (!iso) return 'Never'
        return new Date(iso).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        })
    }

    if (isLoading) {
        return (
            <div className="space-y-3">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-100">
                    <Shield className="h-5 w-5 text-brand-primary" />
                    REST API Keys
                </h2>
                <p className="mt-1 text-sm text-gray-400">
                    API keys for external integrations like Zapier, scripts, and third-party tools.
                    Keys are hashed — the raw key is only shown once at creation.
                </p>
            </div>

            {/* API URL */}
            <div className="rounded-lg border border-border bg-card p-4">
                <label className="mb-2 block text-sm font-medium text-gray-300">
                    API URL
                </label>
                <div className="flex items-center gap-2">
                    <code className="flex-1 rounded bg-gray-900 px-3 py-2 font-mono text-sm text-gray-300 select-all">
                        {apiUrl}
                    </code>
                    <button
                        type="button"
                        onClick={() => {
                            void navigator.clipboard.writeText(apiUrl)
                            setCopiedUrl(true)
                            setTimeout(() => setCopiedUrl(false), 2000)
                        }}
                        className="rounded-md bg-gray-700 p-2 text-gray-300 hover:bg-gray-600"
                        title="Copy API URL"
                    >
                        {copiedUrl ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                    </button>
                </div>
                <p className="mt-1.5 text-xs text-gray-500">
                    Use this URL with your API key to connect Zapier or other integrations.
                </p>
            </div>

            {/* New Key Banner (shown after creation) */}
            {showNewKey && (
                <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4">
                    <p className="mb-2 text-sm font-medium text-green-300">
                        🔑 Your new API key — Copy it now, it won&apos;t be shown again!
                    </p>
                    <div className="flex items-center gap-2">
                        <code className="flex-1 rounded bg-gray-900 px-3 py-2 font-mono text-sm text-green-200 select-all">
                            {showNewKey}
                        </code>
                        <button
                            type="button"
                            onClick={() => void handleCopy(showNewKey)}
                            className="rounded-md bg-green-600 p-2 text-white hover:bg-green-700"
                        >
                            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </button>
                    </div>
                    <button
                        type="button"
                        onClick={() => { setShowNewKey(null); setCopied(false) }}
                        className="mt-2 text-xs text-green-400 hover:text-green-300"
                    >
                        I&apos;ve copied it — dismiss
                    </button>
                </div>
            )}

            {/* Create New Key */}
            <div className="rounded-lg border border-border bg-card p-4">
                <label htmlFor="api-key-name" className="mb-2 block text-sm font-medium text-gray-300">
                    Create new API key
                </label>
                <div className="flex gap-2">
                    <input
                        id="api-key-name"
                        type="text"
                        value={newKeyName}
                        onChange={(e) => setNewKeyName(e.target.value)}
                        placeholder="e.g. Zapier Integration, CI Pipeline"
                        className="flex-1 rounded-md border border-border bg-gray-900 px-3 py-2 text-sm text-gray-200 placeholder:text-gray-500 focus:border-brand-primary focus:outline-none"
                        onKeyDown={(e) => { if (e.key === 'Enter') void handleCreate() }}
                    />
                    <button
                        type="button"
                        onClick={() => void handleCreate()}
                        disabled={!newKeyName.trim() || createKey.isPending}
                        className="flex items-center gap-1.5 rounded-md bg-brand-primary px-4 py-2 text-sm font-medium text-black hover:opacity-90 disabled:opacity-50"
                    >
                        <Plus className="h-4 w-4" />
                        {createKey.isPending ? 'Creating…' : 'Generate'}
                    </button>
                </div>
            </div>

            {/* Key List */}
            {keys && keys.length > 0 ? (
                <div className="divide-y divide-border rounded-lg border border-border bg-card">
                    {keys.map((key) => (
                        <div key={key.id} className="flex items-center justify-between p-4">
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                    <Key className="h-4 w-4 text-gray-400" />
                                    <span className="font-medium text-gray-200">{key.name}</span>
                                </div>
                                <div className="mt-1 flex items-center gap-4 text-xs text-gray-500">
                                    <code className="rounded bg-gray-800 px-1.5 py-0.5 font-mono">
                                        {key.key_prefix}•••••••••
                                    </code>
                                    <span className="flex items-center gap-1">
                                        <Clock className="h-3 w-3" />
                                        Created {formatDate(key.created_at)}
                                    </span>
                                    {key.last_used_at && (
                                        <span>Last used {formatDate(key.last_used_at)}</span>
                                    )}
                                </div>
                            </div>

                            {confirmDeleteId === key.id ? (
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-red-400">Revoke?</span>
                                    <button
                                        type="button"
                                        onClick={() => void handleDelete(key.id)}
                                        disabled={deleteKey.isPending}
                                        className="rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700"
                                    >
                                        Yes
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setConfirmDeleteId(null)}
                                        className="rounded bg-gray-700 px-2 py-1 text-xs text-gray-300 hover:bg-gray-600"
                                    >
                                        No
                                    </button>
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => setConfirmDeleteId(key.id)}
                                    className="rounded p-1.5 text-gray-500 hover:bg-red-500/10 hover:text-red-400"
                                    title="Revoke key"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            ) : (
                !showNewKey && (
                    <div className="rounded-lg border border-dashed border-border p-8 text-center">
                        <Key className="mx-auto h-8 w-8 text-gray-600" />
                        <p className="mt-2 text-sm text-gray-400">
                            No REST API keys yet. Create one to connect Zapier or other integrations.
                        </p>
                    </div>
                )
            )}
        </div>
    )
}
