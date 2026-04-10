// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useLocation } from 'react-router-dom'
import { Menu, Search } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

interface TopBarProps {
    onMenuToggle: () => void
    isMobile: boolean
}

/** Maps route paths to page titles */
const pageTitles: Record<string, string> = {
    '/': 'Dashboard',
    '/agents': 'Agents',
    '/teams': 'Teams',
    '/tasks': 'Tasks',
    '/knowledge': 'Knowledge Base',
    '/marketplace': 'Marketplace',
    '/analytics': 'Analytics',
    '/settings': 'LLM Setup',
    '/settings/api-keys': 'API Keys',
    '/settings/webhooks': 'Webhooks',
    '/settings/channels': 'Channels',
    '/settings/members': 'Members',
    '/settings/workspace': 'Workspace',
    '/settings/billing': 'Billing',
    '/settings/audit-log': 'Audit Log',
    '/settings/automations': 'Automations',
    '/settings/mcp-servers': 'MCP Servers',
    '/settings/a2a': 'A2A Protocol',
    '/settings/chat-widget': 'Chat Widget',
    '/settings/license': 'License',
    '/settings/profile': 'Profile',
}

export function TopBar({ onMenuToggle, isMobile }: TopBarProps) {
    const location = useLocation()
    const { user } = useAuth()

    const pageTitle = pageTitles[location.pathname] ?? 'CrewForm'

    const metadata = (user?.user_metadata ?? {}) as Record<string, unknown>
    const displayName = (typeof metadata.full_name === 'string' ? metadata.full_name : null)
        ?? (typeof metadata.name === 'string' ? metadata.name : null)
        ?? user?.email
        ?? 'User'
    const avatarInitial = displayName.charAt(0).toUpperCase()
    const avatarUrl = typeof metadata.avatar_url === 'string' ? metadata.avatar_url : undefined

    return (
        <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border bg-surface-card px-4 lg:px-6">
            {/* Mobile hamburger */}
            {isMobile && (
                <button
                    type="button"
                    onClick={onMenuToggle}
                    className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-surface-overlay hover:text-gray-200"
                    aria-label="Toggle menu"
                >
                    <Menu className="h-5 w-5" />
                </button>
            )}

            {/* Page title */}
            <h2 className="text-lg font-semibold text-gray-100">{pageTitle}</h2>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Search placeholder (Cmd+K) */}
            <button
                type="button"
                className="hidden items-center gap-2 rounded-lg border border-border bg-surface-primary px-3 py-1.5 text-sm text-gray-500 transition-colors hover:border-gray-600 hover:text-gray-400 md:flex"
                aria-label="Search"
            >
                <Search className="h-4 w-4" />
                <span>Search...</span>
                <kbd className="ml-4 rounded border border-border px-1.5 py-0.5 text-xs text-gray-600">
                    ⌘K
                </kbd>
            </button>

            {/* User avatar (desktop only — sidebar has it on desktop, top bar shows it on tablet) */}
            <div className="hidden md:block lg:hidden">
                {avatarUrl ? (
                    <img
                        src={avatarUrl}
                        alt={displayName}
                        className="h-8 w-8 rounded-full object-cover"
                    />
                ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-overlay text-sm font-medium text-gray-300">
                        {avatarInitial}
                    </div>
                )}
            </div>
        </header>
    )
}
