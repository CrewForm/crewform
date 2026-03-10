// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { Globe, MessageSquare, Hash, Send, Users, CheckSquare, Radio, Columns3 } from 'lucide-react'
import { useOutputRoutes } from '@/hooks/useChannels'
import { cn } from '@/lib/utils'

const DESTINATION_ICONS: Record<string, typeof Globe> = {
    http: Globe,
    discord: MessageSquare,
    slack: Hash,
    telegram: Send,
    teams: Users,
    asana: CheckSquare,
    trello: Columns3,
}

const DESTINATION_COLORS: Record<string, { text: string; bg: string }> = {
    http: { text: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    discord: { text: 'text-indigo-400', bg: 'bg-indigo-500/10' },
    slack: { text: 'text-purple-400', bg: 'bg-purple-500/10' },
    telegram: { text: 'text-sky-400', bg: 'bg-sky-500/10' },
    teams: { text: 'text-blue-400', bg: 'bg-blue-500/10' },
    asana: { text: 'text-rose-400', bg: 'bg-rose-500/10' },
    trello: { text: 'text-teal-400', bg: 'bg-teal-500/10' },
}

interface OutputRouteSelectorProps {
    /** null = all routes, string[] = specific route IDs */
    value: string[] | null
    onChange: (value: string[] | null) => void
}

export function ChannelSelector({ value, onChange }: OutputRouteSelectorProps) {
    const { routes, loading } = useOutputRoutes()

    if (loading) return null

    // Don't render if no routes are configured
    if (routes.length === 0) return null

    const isAll = value === null

    const toggleAll = () => {
        if (isAll) {
            onChange(routes.map((r) => r.id))
        } else {
            onChange(null)
        }
    }

    const toggleRoute = (routeId: string) => {
        if (isAll) {
            onChange(routes.filter((r) => r.id !== routeId).map((r) => r.id))
        } else {
            const isSelected = value.includes(routeId)
            if (isSelected) {
                onChange(value.filter((id) => id !== routeId))
            } else {
                onChange([...value, routeId])
            }
        }
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-300">Output Routes</label>
                <button
                    type="button"
                    onClick={toggleAll}
                    className={cn(
                        'flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
                        isAll
                            ? 'bg-brand-primary/10 text-brand-primary'
                            : 'text-gray-500 hover:text-gray-400',
                    )}
                >
                    <Radio className="h-3 w-3" />
                    {isAll ? 'All routes' : 'Select routes'}
                </button>
            </div>
            <p className="text-xs text-gray-500">
                Choose which output routes (webhooks) receive results on completion.
            </p>
            <div className="grid gap-2">
                {routes.map((route) => {
                    const Icon = DESTINATION_ICONS[route.destination_type] ?? Globe
                    const colors = DESTINATION_COLORS[route.destination_type] ?? DESTINATION_COLORS.http
                    const isSelected = isAll || value.includes(route.id)

                    return (
                        <button
                            key={route.id}
                            type="button"
                            onClick={() => toggleRoute(route.id)}
                            className={cn(
                                'flex items-center gap-3 rounded-lg border p-3 text-left transition-colors',
                                isSelected
                                    ? 'border-gray-600 bg-gray-800/60'
                                    : 'border-gray-700/50 bg-gray-900/30 opacity-50 hover:opacity-75',
                            )}
                        >
                            <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', colors.bg)}>
                                <Icon className={cn('h-4 w-4', colors.text)} />
                            </div>
                            <div className="min-w-0 flex-1">
                                <span className="block text-sm font-medium text-gray-200 truncate">{route.name}</span>
                                <span className="block text-xs text-gray-500 capitalize">{route.destination_type}</span>
                            </div>
                            <div
                                className={cn(
                                    'h-4 w-4 shrink-0 rounded border transition-colors',
                                    isSelected
                                        ? 'border-brand-primary bg-brand-primary'
                                        : 'border-gray-600',
                                )}
                            >
                                {isSelected && (
                                    <svg viewBox="0 0 16 16" className="h-4 w-4 text-black">
                                        <path
                                            d="M12.207 4.793a1 1 0 0 1 0 1.414l-5 5a1 1 0 0 1-1.414 0l-2-2a1 1 0 0 1 1.414-1.414L6.5 9.086l4.293-4.293a1 1 0 0 1 1.414 0z"
                                            fill="currentColor"
                                        />
                                    </svg>
                                )}
                            </div>
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
