// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { Link } from 'react-router-dom'
import { Bot, ListTodo, Users } from 'lucide-react'

/**
 * Quick action cards — jump to common actions from the dashboard.
 */
export function QuickActions() {
    return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Link
                to="/agents/new"
                className="group flex items-center gap-3 rounded-lg border border-border bg-surface-card p-4 transition-all hover:border-brand-primary/40 hover:shadow-md"
            >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-muted transition-colors group-hover:bg-brand-primary/20">
                    <Bot className="h-5 w-5 text-brand-primary" />
                </div>
                <div>
                    <p className="text-sm font-medium text-gray-200">Create Agent</p>
                    <p className="text-xs text-gray-500">Add a new AI agent to your crew</p>
                </div>
            </Link>

            <Link
                to="/tasks"
                className="group flex items-center gap-3 rounded-lg border border-border bg-surface-card p-4 transition-all hover:border-blue-500/40 hover:shadow-md"
            >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 transition-colors group-hover:bg-blue-500/20">
                    <ListTodo className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                    <p className="text-sm font-medium text-gray-200">Create Task</p>
                    <p className="text-xs text-gray-500">Dispatch a task to an agent</p>
                </div>
            </Link>

            <Link
                to="/teams"
                className="group flex items-center gap-3 rounded-lg border border-border bg-surface-card p-4 transition-all hover:border-green-500/40 hover:shadow-md"
            >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10 transition-colors group-hover:bg-green-500/20">
                    <Users className="h-5 w-5 text-green-400" />
                </div>
                <div>
                    <p className="text-sm font-medium text-gray-200">Run Team</p>
                    <p className="text-xs text-gray-500">Execute a pipeline team</p>
                </div>
            </Link>
        </div>
    )
}
