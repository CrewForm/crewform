// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useState, useEffect } from 'react'
import { Building2, Save, Loader2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { useWorkspace } from '@/hooks/useWorkspace'
import { useUpdateWorkspace } from '@/hooks/useMembers'
import { useCurrentRole } from '@/hooks/useCurrentRole'

export function WorkspaceSettings() {
    const { workspaceId, workspace } = useWorkspace()
    const { hasMinRole } = useCurrentRole()
    const updateMutation = useUpdateWorkspace()
    const isOwner = hasMinRole('owner')

    const [name, setName] = useState('')
    const [slug, setSlug] = useState('')
    const [showDanger, setShowDanger] = useState(false)

    useEffect(() => {
        if (workspace) {
            setName(workspace.name)
            setSlug(workspace.slug)
        }
    }, [workspace])

    const isDirty = workspace
        ? name !== workspace.name || slug !== workspace.slug
        : false

    function handleSave() {
        if (!workspaceId) return
        updateMutation.mutate({ workspaceId, data: { name, slug } })
    }


    return (
        <div className="space-y-6">
            {/* Workspace info */}
            <div className="rounded-lg border border-border bg-surface-card p-5">
                <div className="mb-4 flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-brand-primary" />
                    <h3 className="text-sm font-medium text-gray-200">Workspace Details</h3>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="mb-1.5 block text-xs font-medium text-gray-400">
                            Workspace Name
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            disabled={!isOwner}
                            className="w-full rounded-lg border border-border bg-surface-primary px-3 py-2 text-sm text-gray-200 outline-none focus:border-brand-primary disabled:opacity-50"
                        />
                    </div>

                    <div>
                        <label className="mb-1.5 block text-xs font-medium text-gray-400">
                            Workspace Slug
                        </label>
                        <input
                            type="text"
                            value={slug}
                            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                            disabled={!isOwner}
                            className="w-full rounded-lg border border-border bg-surface-primary px-3 py-2 font-mono text-sm text-gray-200 outline-none focus:border-brand-primary disabled:opacity-50"
                        />
                    </div>

                    {isOwner && isDirty && (
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={updateMutation.isPending || (!name.trim() && !slug.trim())}
                            className="flex items-center gap-1.5 rounded-lg bg-brand-primary px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
                        >
                            {updateMutation.isPending ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                                <Save className="h-3 w-3" />
                            )}
                            Save Changes
                        </button>
                    )}

                    {updateMutation.isSuccess && (
                        <p className="text-xs text-green-400">Workspace updated successfully.</p>
                    )}
                </div>
            </div>

            {/* Danger zone — owner only */}
            {isOwner && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-5">
                    <div className="mb-3 flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-red-400" />
                        <h3 className="text-sm font-medium text-red-400">Danger Zone</h3>
                    </div>
                    {!showDanger ? (
                        <button
                            type="button"
                            onClick={() => setShowDanger(true)}
                            className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/10"
                        >
                            Delete Workspace
                        </button>
                    ) : (
                        <div className="space-y-2">
                            <p className="text-xs text-red-300">
                                This will permanently delete the workspace, all agents, tasks, and data. This cannot be undone.
                            </p>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setShowDanger(false)}
                                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-gray-400 transition-colors hover:bg-surface-elevated"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        // Full delete would need navigation + confirmation
                                        toast.info('Workspace deletion requires typing the workspace name to confirm. Coming soon.')
                                    }}
                                    className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700"
                                >
                                    I understand, delete this workspace
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
