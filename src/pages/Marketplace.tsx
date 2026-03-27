// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useState, useDeferredValue } from 'react'
import { Store, Loader2, CheckCircle2, XCircle, Upload, BarChart3 } from 'lucide-react'
import { useWorkspace } from '@/hooks/useWorkspace'
import { useAuth } from '@/hooks/useAuth'
import { useMarketplaceAgents, useMarketplaceTags, useMySubmissions } from '@/hooks/useMarketplace'
import { useInstallAgent } from '@/hooks/useInstallAgent'
import { MarketplaceFilters } from '@/components/marketplace/MarketplaceFilters'
import { AgentCard } from '@/components/marketplace/AgentCard'
import { AgentDetailModal } from '@/components/marketplace/AgentDetailModal'
import { CreatorDashboard } from '@/components/marketplace/CreatorDashboard'
import { ErrorState } from '@/components/shared/ErrorState'
import type { MarketplaceSortOption } from '@/db/marketplace'
import type { Agent } from '@/types'
import { cn } from '@/lib/utils'

type MarketplaceTab = 'browse' | 'submissions' | 'creator'

const STATUS_COLORS: Record<string, string> = {
  pending: 'text-amber-400 bg-amber-500/10',
  approved: 'text-green-400 bg-green-500/10',
  rejected: 'text-red-400 bg-red-500/10',
}

export function Marketplace() {
  const [activeTab, setActiveTab] = useState<MarketplaceTab>('browse')

  // ─── Filter state ────────────────────────────────────────────────────────
  const [search, setSearch] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [sort, setSort] = useState<MarketplaceSortOption>('installs')
  const [category, setCategory] = useState<string | null>(null)
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const deferredSearch = useDeferredValue(search)

  // ─── Data ────────────────────────────────────────────────────────────────
  const { workspaceId } = useWorkspace()
  const { user } = useAuth()
  const { agents, isLoading, error, refetch } = useMarketplaceAgents({
    search: deferredSearch,
    tags: selectedTags.length > 0 ? selectedTags : undefined,
    category: category ?? undefined,
    sort,
  })
  const { tags: availableTags } = useMarketplaceTags()
  const installMutation = useInstallAgent()
  const { data: mySubmissions = [] } = useMySubmissions(user?.id ?? null)

  // ─── Handlers ────────────────────────────────────────────────────────────
  const handleTagToggle = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    )
  }

  const handleInstall = (agent: Agent) => {
    if (!workspaceId || !user) return

    installMutation.mutate(
      { agentId: agent.id, workspaceId, userId: user.id },
      {
        onSuccess: (result) => {
          setToast({ type: 'success', message: `"${result.clonedAgent.name}" installed to your workspace!` })
          setSelectedAgent(null)
          setTimeout(() => setToast(null), 4000)
        },
        onError: (err) => {
          setToast({ type: 'error', message: err.message })
          setTimeout(() => setToast(null), 4000)
        },
      },
    )
  }

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Store className="h-6 w-6 text-brand-primary" />
          <h1 className="text-2xl font-semibold text-gray-100">Marketplace</h1>
        </div>
        <p className="text-sm text-gray-500">
          Browse, install, and publish agents with the CrewForm community.
        </p>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex border-b border-border">
        {([
          { key: 'browse' as const, label: 'Browse', icon: Store },
          { key: 'submissions' as const, label: 'My Submissions', icon: Upload },
          { key: 'creator' as const, label: 'Creator Dashboard', icon: BarChart3 },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={cn(
              'flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
              activeTab === key
                ? 'border-brand-primary text-gray-200'
                : 'border-transparent text-gray-500 hover:text-gray-300',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'browse' && (
        <>
          {/* Filters */}
          <div className="mb-6">
            <MarketplaceFilters
              search={search}
              onSearchChange={setSearch}
              selectedTags={selectedTags}
              onTagToggle={handleTagToggle}
              availableTags={availableTags}
              sort={sort}
              onSortChange={setSort}
              category={category}
              onCategoryChange={setCategory}
            />
          </div>

          {/* Agent Grid */}
          {error ? (
            <ErrorState
              message={error instanceof Error ? error.message : 'Failed to load marketplace'}
              onRetry={() => void refetch()}
            />
          ) : isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
            </div>
          ) : agents.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-surface-card py-16">
              <Store className="mb-4 h-12 w-12 text-gray-600" />
              <h2 className="mb-2 text-lg font-medium text-gray-300">
                No agents found
              </h2>
              <p className="text-sm text-gray-500">
                Try adjusting your search or filters.
              </p>
            </div>
          ) : (
            <>
              <p className="mb-4 text-xs text-gray-500">
                {agents.length} agent{agents.length !== 1 ? 's' : ''} found
              </p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {agents.map((agent) => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    onClick={setSelectedAgent}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {activeTab === 'submissions' && (
        <div>
          {mySubmissions.length === 0 ? (
            <div className="rounded-xl border border-border bg-surface-card p-8 text-center">
              <Upload className="mx-auto mb-2 h-10 w-10 text-gray-600" />
              <h3 className="mb-1 text-lg font-medium text-gray-300">No submissions yet</h3>
              <p className="text-sm text-gray-500">
                Publish an agent from its detail page to get started.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-surface-card divide-y divide-border/50">
              {mySubmissions.map((sub) => (
                <div key={sub.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-200">
                      {sub.agent_name ?? 'Unknown Agent'}
                    </p>
                    <p className="text-xs text-gray-500">
                      Submitted {new Date(sub.created_at).toLocaleDateString()}
                    </p>
                    {sub.status === 'rejected' && sub.review_notes && (
                      <p className="mt-1 text-xs text-red-400">Reason: {sub.review_notes}</p>
                    )}
                  </div>
                  <span className={cn(
                    'rounded-md px-2 py-1 text-[10px] font-bold uppercase',
                    STATUS_COLORS[sub.status] ?? STATUS_COLORS.pending,
                  )}>
                    {sub.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'creator' && <CreatorDashboard />}

      {/* Detail Modal */}
      <AgentDetailModal
        agent={selectedAgent}
        onClose={() => setSelectedAgent(null)}
        onInstall={handleInstall}
        isInstalling={installMutation.isPending}
      />

      {/* Toast notification */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium shadow-lg transition-all ${toast.type === 'success'
          ? 'bg-green-500/10 border border-green-500/30 text-green-400'
          : 'bg-red-500/10 border border-red-500/30 text-red-400'
          }`}>
          {toast.type === 'success'
            ? <CheckCircle2 className="h-4 w-4" />
            : <XCircle className="h-4 w-4" />
          }
          {toast.message}
        </div>
      )}
    </div>
  )
}
