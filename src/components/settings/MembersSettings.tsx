// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useState } from 'react'
import {
    Mail, Trash2, Loader2, Copy, CheckCircle2,
    Shield, ShieldCheck, ShieldAlert, Eye, UserCog,
} from 'lucide-react'
import { useMembers, useUpdateMemberRole, useRemoveMember, useInvitations, useCreateInvitation, useRevokeInvitation } from '@/hooks/useMembers'
import { useCurrentRole } from '@/hooks/useCurrentRole'
import { useWorkspace } from '@/hooks/useWorkspace'
import { cn } from '@/lib/utils'
import type { WorkspaceRole } from '@/types'

const ROLE_OPTIONS: { value: WorkspaceRole; label: string; icon: typeof Shield }[] = [
    { value: 'admin', label: 'Admin', icon: ShieldAlert },
    { value: 'manager', label: 'Manager', icon: ShieldCheck },
    { value: 'member', label: 'Member', icon: UserCog },
    { value: 'viewer', label: 'Viewer', icon: Eye },
]

const ROLE_COLORS: Record<WorkspaceRole, string> = {
    owner: 'text-amber-400 bg-amber-500/10',
    admin: 'text-red-400 bg-red-500/10',
    manager: 'text-blue-400 bg-blue-500/10',
    member: 'text-green-400 bg-green-500/10',
    viewer: 'text-gray-400 bg-gray-500/10',
}

export function MembersSettings() {
    const { workspaceId } = useWorkspace()
    const { data: members, isLoading: isLoadingMembers } = useMembers(workspaceId)
    const { data: invitations, isLoading: isLoadingInvites } = useInvitations(workspaceId)
    const { hasMinRole } = useCurrentRole()
    const isAdmin = hasMinRole('admin')

    if (isLoadingMembers) {
        return (
            <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Invite form — admins+ only */}
            {isAdmin && workspaceId && <InviteForm workspaceId={workspaceId} />}

            {/* Pending invitations */}
            {isAdmin && invitations && invitations.length > 0 && (
                <div>
                    <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
                        Pending Invitations ({invitations.length})
                    </h3>
                    <div className="space-y-2">
                        {invitations.map((inv) => (
                            <InvitationRow key={inv.id} invitation={inv} />
                        ))}
                    </div>
                </div>
            )}

            {isLoadingInvites && isAdmin && (
                <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
                </div>
            )}

            {/* Member list */}
            <div>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
                    Members ({members?.length ?? 0})
                </h3>
                <div className="space-y-1">
                    {members?.map((member) => (
                        <MemberRow key={member.id} member={member} isAdmin={isAdmin} />
                    ))}
                </div>
            </div>
        </div>
    )
}

// ─── Invite Form ────────────────────────────────────────────────────────────

function InviteForm({ workspaceId }: { workspaceId: string }) {
    const [email, setEmail] = useState('')
    const [role, setRole] = useState<WorkspaceRole>('member')
    const createMutation = useCreateInvitation()

    async function handleInvite() {
        if (!email.trim()) return
        const { data: { user } } = await (await import('@/lib/supabase')).supabase.auth.getUser()
        if (!user) return

        createMutation.mutate(
            { workspaceId, email: email.trim(), role, invitedBy: user.id },
            { onSuccess: () => setEmail('') },
        )
    }

    return (
        <div className="rounded-lg border border-border bg-surface-card p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-gray-200">
                <Mail className="h-4 w-4 text-brand-primary" />
                Invite Member
            </h3>
            <div className="flex gap-2">
                <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="colleague@company.com"
                    className="flex-1 rounded-lg border border-border bg-surface-primary px-3 py-2 text-sm text-gray-200 outline-none focus:border-brand-primary"
                />
                <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as WorkspaceRole)}
                    className="rounded-lg border border-border bg-surface-primary px-3 py-2 text-sm text-gray-200 outline-none"
                >
                    {ROLE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                </select>
                <button
                    type="button"
                    onClick={() => void handleInvite()}
                    disabled={!email.trim() || createMutation.isPending}
                    className="flex items-center gap-1.5 rounded-lg bg-brand-primary px-4 py-2 text-xs font-medium text-black transition-colors hover:bg-brand-hover disabled:opacity-50"
                >
                    {createMutation.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                    Invite
                </button>
            </div>
        </div>
    )
}

// ─── Invitation Row ─────────────────────────────────────────────────────────

function InvitationRow({ invitation }: { invitation: { id: string; email: string; role: WorkspaceRole; token: string; workspace_id: string; expires_at: string } }) {
    const revokeMutation = useRevokeInvitation()
    const [copied, setCopied] = useState(false)

    function copyInviteLink() {
        const url = `${window.location.origin}/invite/${invitation.token}`
        void navigator.clipboard.writeText(url)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    return (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-card px-4 py-3">
            <Mail className="h-4 w-4 shrink-0 text-gray-500" />
            <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-200">{invitation.email}</p>
                <p className="text-xs text-gray-500">
                    Expires {new Date(invitation.expires_at).toLocaleDateString()}
                </p>
            </div>
            <span className={cn('rounded-md px-2 py-0.5 text-[10px] font-medium', ROLE_COLORS[invitation.role])}>
                {invitation.role}
            </span>
            <button
                type="button"
                onClick={copyInviteLink}
                title="Copy invite link"
                className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-surface-raised hover:text-gray-300"
            >
                {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
            <button
                type="button"
                onClick={() => revokeMutation.mutate({ id: invitation.id, workspaceId: invitation.workspace_id })}
                disabled={revokeMutation.isPending}
                title="Revoke"
                className="rounded-md p-1.5 text-gray-600 transition-colors hover:bg-red-500/10 hover:text-red-400"
            >
                <Trash2 className="h-3.5 w-3.5" />
            </button>
        </div>
    )
}

// ─── Member Row ─────────────────────────────────────────────────────────────

function MemberRow({ member, isAdmin }: {
    member: { id: string; user_id: string; role: WorkspaceRole; display_name: string | null; joined_at: string; workspace_id: string }
    isAdmin: boolean
}) {
    const updateRoleMutation = useUpdateMemberRole()
    const removeMutation = useRemoveMember()
    const isOwner = member.role === 'owner'

    function handleRoleChange(newRole: WorkspaceRole) {
        updateRoleMutation.mutate({
            memberId: member.id,
            role: newRole,
            workspaceId: member.workspace_id,
        })
    }

    function handleRemove() {
        if (!confirm(`Remove ${member.display_name ?? 'this member'} from the workspace?`)) return
        removeMutation.mutate({ memberId: member.id, workspaceId: member.workspace_id })
    }

    return (
        <div className="flex items-center gap-3 rounded-lg px-4 py-2.5 transition-colors hover:bg-surface-elevated">
            {/* Avatar */}
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-raised text-sm font-medium text-gray-400">
                {(member.display_name ?? '?')[0].toUpperCase()}
            </div>

            {/* Info */}
            <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-200">
                    {member.display_name ?? 'Unknown User'}
                </p>
                <p className="text-xs text-gray-500">
                    Joined {new Date(member.joined_at).toLocaleDateString()}
                </p>
            </div>

            {/* Role */}
            {isAdmin && !isOwner ? (
                <select
                    value={member.role}
                    onChange={(e) => handleRoleChange(e.target.value as WorkspaceRole)}
                    disabled={updateRoleMutation.isPending}
                    className={cn(
                        'rounded-md border border-transparent px-2 py-1 text-xs font-medium outline-none',
                        ROLE_COLORS[member.role],
                    )}
                >
                    {ROLE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                </select>
            ) : (
                <span className={cn('rounded-md px-2 py-0.5 text-[10px] font-medium', ROLE_COLORS[member.role])}>
                    {member.role}
                </span>
            )}

            {/* Remove — admins+ only, can't remove owner */}
            {isAdmin && !isOwner && (
                <button
                    type="button"
                    onClick={handleRemove}
                    disabled={removeMutation.isPending}
                    className="rounded-md p-1.5 text-gray-600 transition-colors hover:bg-red-500/10 hover:text-red-400"
                >
                    <Trash2 className="h-3.5 w-3.5" />
                </button>
            )}
        </div>
    )
}
