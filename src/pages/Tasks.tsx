// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useState } from 'react'
import { ListTodo, Plus, SearchX, LayoutList, CalendarDays } from 'lucide-react'
import { useWorkspace } from '@/hooks/useWorkspace'
import { useAgents } from '@/hooks/useAgents'
import { useTasksQuery } from '@/hooks/useTasksQuery'
import { TaskRow } from '@/components/tasks/TaskRow'
import { TaskFilters } from '@/components/tasks/TaskFilters'
import { CreateTaskModal } from '@/components/tasks/CreateTaskModal'
import { TaskDetailPanel } from '@/components/tasks/TaskDetailPanel'
import { TaskCalendar } from '@/components/tasks/TaskCalendar'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/shared/ErrorState'
import { RoleGate } from '@/components/ui/RoleGate'
import { cn } from '@/lib/utils'
import type { TaskStatus, TaskPriority } from '@/types'

export function Tasks() {
  const { workspaceId } = useWorkspace()
  const { agents } = useAgents(workspaceId)

  // Filter state
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<TaskStatus[]>([])
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority[]>([])
  const [agentFilter, setAgentFilter] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list')
  const [calendarDate, setCalendarDate] = useState<string | undefined>(undefined)

  const filters = {
    status: statusFilter.length > 0 ? statusFilter : undefined,
    priority: priorityFilter.length > 0 ? priorityFilter : undefined,
    agentId: agentFilter || undefined,
    search: search || undefined,
  }

  const { tasks, isLoading, error, refetch } = useTasksQuery(workspaceId, filters)

  const hasFilters = search || statusFilter.length > 0 || priorityFilter.length > 0 || agentFilter

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ListTodo className="h-6 w-6 text-brand-primary" />
          <h1 className="text-2xl font-semibold text-gray-100">Tasks</h1>
          {!isLoading && tasks.length > 0 && (
            <span className="rounded-full bg-surface-elevated px-2.5 py-0.5 text-xs font-medium text-gray-400">
              {tasks.length}
            </span>
          )}
        </div>
        <RoleGate minRole="member">
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-brand-hover"
          >
            <Plus className="h-4 w-4" />
            New Task
          </button>
        </RoleGate>
      </div>

      {/* View Toggle + Filters */}
      <div className="mb-4 flex items-center gap-3">
        <div className="flex rounded-lg border border-border p-0.5">
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              viewMode === 'list'
                ? 'bg-brand-primary text-black'
                : 'text-gray-500 hover:text-gray-300',
            )}
          >
            <LayoutList className="h-3.5 w-3.5" />
            List
          </button>
          <button
            type="button"
            onClick={() => setViewMode('calendar')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              viewMode === 'calendar'
                ? 'bg-brand-primary text-black'
                : 'text-gray-500 hover:text-gray-300',
            )}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            Calendar
          </button>
        </div>
      </div>

      {/* Filters (list view only) */}
      {viewMode === 'list' && (
        <TaskFilters
          search={search}
          onSearchChange={setSearch}
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
          priorityFilter={priorityFilter}
          onPriorityChange={setPriorityFilter}
          agentFilter={agentFilter}
          onAgentChange={setAgentFilter}
          agents={agents}
        />
      )}

      {/* Loading */}
      {viewMode === 'list' && isLoading && (
        <div className="space-y-3">
          {[...Array(5) as undefined[]].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      )}

      {viewMode === 'list' && !isLoading && error && (
        <ErrorState
          message={error instanceof Error ? error.message : 'Failed to load tasks'}
          onRetry={() => void refetch()}
        />
      )}

      {/* Calendar View */}
      {viewMode === 'calendar' && (
        <TaskCalendar
          onSelectDate={(date) => {
            setCalendarDate(date)
            setShowCreateModal(true)
          }}
          onSelectTask={(taskId) => setSelectedTaskId(taskId)}
        />
      )}

      {/* Table (list view) */}
      {viewMode === 'list' && !isLoading && !error && tasks.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface-card">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-surface-elevated/50">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Title</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Agent</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Priority</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Created</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Elapsed</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <TaskRow key={task.id} task={task} agents={agents} onClick={() => setSelectedTaskId(task.id)} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty — no tasks at all */}
      {viewMode === 'list' && !isLoading && tasks.length === 0 && !hasFilters && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-surface-card py-16">
          <ListTodo className="mb-4 h-12 w-12 text-gray-600" />
          <h2 className="mb-2 text-lg font-medium text-gray-300">No tasks yet</h2>
          <p className="mb-4 text-sm text-gray-500">
            Create a task and assign it to an agent to get started.
          </p>
          <RoleGate minRole="member">
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-brand-hover"
            >
              <Plus className="h-4 w-4" />
              Create First Task
            </button>
          </RoleGate>
        </div>
      )}

      {/* Empty — no results for filters */}
      {viewMode === 'list' && !isLoading && tasks.length === 0 && hasFilters && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-surface-card py-16">
          <SearchX className="mb-4 h-12 w-12 text-gray-600" />
          <h2 className="mb-2 text-lg font-medium text-gray-300">No matching tasks</h2>
          <p className="text-sm text-gray-500">
            Try adjusting your filters or search query.
          </p>
        </div>
      )}

      {/* Create modal */}
      {showCreateModal && (
        <CreateTaskModal
          onClose={() => {
            setShowCreateModal(false)
            setCalendarDate(undefined)
          }}
          initialDate={calendarDate}
        />
      )}

      {/* Detail panel */}
      {selectedTaskId && (
        <TaskDetailPanel
          taskId={selectedTaskId}
          agents={agents}
          onClose={() => setSelectedTaskId(null)}
        />
      )}
    </div>
  )
}
