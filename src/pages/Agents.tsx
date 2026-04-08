// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useState, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bot, LayoutGrid, List, Search, AlertCircle, RefreshCw, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { useAgents } from '@/hooks/useAgents'
import { useWorkspace } from '@/hooks/useWorkspace'
import { AgentCard } from '@/components/agents/AgentCard'
import { AgentListRow } from '@/components/agents/AgentListRow'
import { SkeletonCard } from '@/components/ui/skeleton'
import { Skeleton } from '@/components/ui/skeleton'
import { RoleGate } from '@/components/ui/RoleGate'
import type { Agent } from '@/types'
import { parseExportFile, importAgent, importTeam, type CrewFormExport, type AgentExport, type TeamExport } from '@/lib/exportImport'

type ViewMode = 'grid' | 'list'
type SortField = 'name' | 'status' | 'model' | 'created'

export function Agents() {
  const navigate = useNavigate()
  const { workspaceId } = useWorkspace()
  const { agents, isLoading, error, refetch } = useAgents(workspaceId)
  const importInputRef = useRef<HTMLInputElement>(null)

  function handleImport(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed: CrewFormExport = parseExportFile(reader.result as string)
        if (parsed.type === 'agent') {
          void importAgent(workspaceId ?? '', parsed.data as AgentExport).then((newId) => {
            toast.success('Agent imported successfully')
            void refetch()
            navigate(`/agents/${newId}`)
          }).catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : 'Unknown error'
            toast.error(`Import failed: ${msg}`)
          })
        } else {
          void importTeam(workspaceId ?? '', parsed.data as TeamExport).then((newId) => {
            toast.success('Team and agents imported successfully')
            navigate(`/teams/${newId}`)
          }).catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : 'Unknown error'
            toast.error(`Import failed: ${msg}`)
          })
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Invalid file'
        toast.error(msg)
      }
    }
    reader.readAsText(file)
  }

  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<SortField>('created')

  // Filter and sort agents
  const filteredAgents = useMemo(() => {
    let result = [...agents]

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q) ||
          a.model.toLowerCase().includes(q),
      )
    }

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name)
        case 'status': {
          const order: Record<Agent['status'], number> = { busy: 0, idle: 1, offline: 2 }
          return order[a.status] - order[b.status]
        }
        case 'model':
          return a.model.localeCompare(b.model)
        case 'created':
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      }
    })

    return result
  }, [agents, searchQuery, sortBy])

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bot className="h-6 w-6 text-brand-primary" />
          <h1 className="text-2xl font-semibold text-gray-100">Agents</h1>
          {!isLoading && agents.length > 0 && (
            <span className="rounded-full bg-surface-elevated px-2.5 py-0.5 text-xs font-medium text-gray-400">
              {agents.length}
            </span>
          )}
        </div>
        <RoleGate minRole="member">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => importInputRef.current?.click()}
              className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-gray-400 transition-colors hover:bg-surface-elevated hover:text-gray-200"
              title="Import agent or team from JSON"
            >
              <Upload className="h-4 w-4" />
              Import
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleImport(file)
                e.target.value = ''
              }}
            />
            <button
              type="button"
              onClick={() => navigate('/agents/new')}
              className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-brand-hover"
            >
              + New Agent
            </button>
          </div>
        </RoleGate>
      </div>

      {/* Toolbar: search + view toggle + sort */}
      {(isLoading || agents.length > 0) && (
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              placeholder="Search agents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-card py-2 pl-9 pr-4 text-sm text-gray-200 placeholder-gray-500 outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary"
            />
          </div>

          <div className="flex items-center gap-2">
            {/* Sort dropdown */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortField)}
              className="rounded-lg border border-border bg-surface-card px-3 py-2 text-sm text-gray-300 outline-none focus:border-brand-primary"
            >
              <option value="created">Newest First</option>
              <option value="name">Name</option>
              <option value="status">Status</option>
              <option value="model">Model</option>
            </select>

            {/* View toggle */}
            <div className="flex rounded-lg border border-border">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`rounded-l-lg p-2 transition-colors ${viewMode === 'grid'
                  ? 'bg-surface-elevated text-gray-200'
                  : 'text-gray-500 hover:text-gray-300'
                  }`}
                aria-label="Grid view"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`rounded-r-lg p-2 transition-colors ${viewMode === 'list'
                  ? 'bg-surface-elevated text-gray-200'
                  : 'text-gray-500 hover:text-gray-300'
                  }`}
                aria-label="List view"
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        viewMode === 'grid' ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        )
      )}

      {/* Error state */}
      {error && !isLoading && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-status-error/30 bg-status-error/5 py-12">
          <AlertCircle className="mb-3 h-10 w-10 text-status-error-text" />
          <h2 className="mb-1 text-lg font-medium text-gray-300">Failed to load agents</h2>
          <p className="mb-4 text-sm text-gray-500">
            {error instanceof Error ? error.message : 'An unexpected error occurred'}
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="flex items-center gap-2 rounded-lg bg-surface-elevated px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-surface-overlay"
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </button>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && agents.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-surface-card py-16">
          <Bot className="mb-4 h-12 w-12 text-gray-600" />
          <h2 className="mb-2 text-lg font-medium text-gray-300">
            No agents yet
          </h2>
          <p className="mb-6 text-sm text-gray-500">
            Create your first agent to get started.
          </p>
          <RoleGate minRole="member">
            <button
              type="button"
              onClick={() => navigate('/agents/new')}
              className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-brand-hover"
            >
              + Create Agent
            </button>
          </RoleGate>
        </div>
      )}

      {/* No search results */}
      {!isLoading && !error && agents.length > 0 && filteredAgents.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-surface-card py-12">
          <Search className="mb-3 h-8 w-8 text-gray-600" />
          <p className="text-sm text-gray-400">
            No agents match &ldquo;{searchQuery}&rdquo;
          </p>
        </div>
      )}

      {/* Agent grid */}
      {!isLoading && !error && filteredAgents.length > 0 && viewMode === 'grid' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredAgents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}

      {/* Agent list */}
      {!isLoading && !error && filteredAgents.length > 0 && viewMode === 'list' && (
        <div className="space-y-2">
          {filteredAgents.map((agent) => (
            <AgentListRow key={agent.id} agent={agent} />
          ))}
        </div>
      )}
    </div>
  )
}
