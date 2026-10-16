// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { NavLink } from 'react-router-dom'
import {
    LayoutDashboard,
    Bot,
    ListTodo,
    Users,
    MoreHorizontal,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const mobileNavItems = [
    { to: '/', icon: LayoutDashboard, label: 'Home' },
    { to: '/agents', icon: Bot, label: 'Agents' },
    { to: '/tasks', icon: ListTodo, label: 'Tasks' },
    { to: '/teams', icon: Users, label: 'Teams' },
    { to: '/settings', icon: MoreHorizontal, label: 'More' },
] as const

/**
 * Bottom navigation bar for mobile viewports (xs/sm).
 * Shows 5 core navigation items with active state.
 */
export function MobileNav() {
    return (
        <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-surface-card md:hidden">
            <div className="flex items-center justify-around">
                {mobileNavItems.map(({ to, icon: Icon, label }) => (
                    <NavLink
                        key={to}
                        to={to}
                        end={to === '/'}
                        className={({ isActive }) =>
                            cn(
                                'flex flex-1 flex-col items-center gap-1 py-2 text-xs transition-colors',
                                isActive
                                    ? 'text-brand-primary'
                                    : 'text-gray-500 hover:text-gray-300',
                            )
                        }
                    >
                        <Icon className="h-5 w-5" />
                        <span>{label}</span>
                    </NavLink>
                ))}
            </div>
            {/* Safe area padding for iOS notch/home indicator */}
            <div className="h-safe-bottom" />
        </nav>
    )
}
