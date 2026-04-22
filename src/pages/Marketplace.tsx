// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useState, useDeferredValue } from 'react'
import { Store, Loader2, CheckCircle2, XCircle, Upload, BarChart3, Bot, Users2, LayoutTemplate } from 'lucide-react'
import { useWorkspace } from '@/hooks/useWorkspace'
import { useAuth } from '@/hooks/useAuth'
import { useMarketplaceAgents, useMarketplaceTags, useMySubmissions, useMarketplaceTeams, useMarketplaceTeamTags } from '@/hooks/useMarketplace'
import { useInstallAgent } from '@/hooks/useInstallAgent'
import { useInstallTeam } from '@/hooks/useMarketplace'
import { MarketplaceFilters } from '@/components/marketplace/MarketplaceFilters'
import { AgentCard } from '@/components/marketplace/AgentCard'
import { AgentDetailModal } from '@/components/marketplace/AgentDetailModal'
import { TeamCard } from '@/components/marketplace/TeamCard'
import { TeamDetailModal } from '@/components/marketplace/TeamDetailModal'
import { CreatorDashboard } from '@/components/marketplace/CreatorDashboard'
import { TemplateCard } from '@/components/marketplace/TemplateCard'
import { TemplateInstallModal } from '@/components/marketplace/TemplateInstallModal'
import { usePublishedTemplates } from '@/hooks/useWorkflowTemplates'
import { ErrorState } from '@/components/shared/ErrorState'
import type { MarketplaceSortOption } from '@/db/marketplace'
import type { Agent, Team, WorkflowTemplate } from '@/types'
import { cn } from '@/lib/utils'

type MarketplaceTab = 'browse' | 'submissions' | 'creator'
type BrowseType = 'agents' | 'teams' | 'templates'

const STATUS_COLORS: Record<string, string> = {
  pending: 'text-amber-400 bg-amber-500/10',
  approved: 'text-green-400 bg-green-500/10',
  rejected: 'text-red-400 bg-red-500/10',
}

export function Marketplace() {
  const [activeTab, setActiveTab] = useState<MarketplaceTab>('browse')
  const [browseType, setBrowseType] = useState<BrowseType>('agents')

  // ─── Filter state ────────────────────────────────────────────────────────
  const [search, setSearch] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [sort, setSort] = useState<MarketplaceSortOption>('installs')
  const [category, setCategory] = useState<string | null>(null)
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null)
  const [selectedTemplate, setSelectedTemplate] = useState<WorkflowTemplate | null>(null)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const deferredSearch = useDeferredValue(search)

  // ─── Data ────────────────────────────────────────────────────────────────
  const { workspaceId } = useWorkspace()
  const { user } = useAuth()

  const queryOptions = {
    search: deferredSearch,
    tags: selectedTags.length > 0 ? selectedTags : undefined,
    category: category ?? undefined,
    sort,
  }

  const { agents, isLoading: agentsLoading, error: agentsError, refetch: refetchAgents } = useMarketplaceAgents(queryOptions)
  const { teams, isLoading: teamsLoading, error: teamsError, refetch: refetchTeams } = useMarketplaceTeams(queryOptions)
  const { tags: agentTags } = useMarketplaceTags()
  const { tags: teamTags } = useMarketplaceTeamTags()

  const { templates, isLoading: templatesLoading, error: templatesError } = usePublishedTemplates({
    search: deferredSearch,
    sort: sort === 'installs' ? 'installs' : sort === 'newest' ? 'newest' : 'name',
  })

  const availableTags = browseType === 'agents' ? agentTags : teamTags
  const isLoading = browseType === 'agents' ? agentsLoading : browseType === 'teams' ? teamsLoading : templatesLoading
  const error = browseType === 'agents' ? agentsError : browseType === 'teams' ? teamsError : templatesError

  const installAgentMutation = useInstallAgent()
  const installTeamMutation = useInstallTeam()
  const { data: mySubmissions = [] } = useMySubmissions(user?.id ?? null)

  // ─── Handlers ────────────────────────────────────────────────────────────
  const handleTagToggle = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    )
  }

  const handleBrowseTypeChange = (type: BrowseType) => {
    setBrowseType(type)
    setSelectedTags([])
    setCategory(null)
  }

  const handleInstallAgent = (agent: Agent) => {
    if (!workspaceId || !user) return

    installAgentMutation.mutate(
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

  const handleInstallTeam = (team: Team) => {
    if (!workspaceId || !user) return

    installTeamMutation.mutate(
      { teamId: team.id, workspaceId, userId: user.id },
      {
        onSuccess: () => {
          setToast({ type: 'success', message: `"${team.name}" team installed to your workspace!` })
          setSelectedTeam(null)
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
          Browse, install, and publish agents, teams, and workflow templates with the CrewForm community.
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
          {/* Agents / Teams toggle */}
          <div className="mb-4 flex items-center gap-1 rounded-lg border border-border bg-surface-card p-1 w-fit">
            <button
              type="button"
              onClick={() => handleBrowseTypeChange('agents')}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                browseType === 'agents'
                  ? 'bg-brand-primary/10 text-brand-primary'
                  : 'text-gray-500 hover:text-gray-300',
              )}
            >
              <Bot className="h-3.5 w-3.5" />
              Agents
            </button>
            <button
              type="button"
              onClick={() => handleBrowseTypeChange('teams')}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                browseType === 'teams'
                  ? 'bg-brand-primary/10 text-brand-primary'
                  : 'text-gray-500 hover:text-gray-300',
              )}
            >
              <Users2 className="h-3.5 w-3.5" />
              Teams
            </button>
            <button
              type="button"
              onClick={() => handleBrowseTypeChange('templates')}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                browseType === 'templates'
                  ? 'bg-brand-primary/10 text-brand-primary'
                  : 'text-gray-500 hover:text-gray-300',
              )}
            >
              <LayoutTemplate className="h-3.5 w-3.5" />
              Templates
            </button>
          </div>

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

          {/* Grid */}
          {error ? (
            <ErrorState
              message={error instanceof Error ? error.message : 'Failed to load marketplace'}
              onRetry={() => browseType === 'agents' ? void refetchAgents() : void refetchTeams()}
            />
          ) : isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
            </div>
          ) : browseType === 'templates' ? (
            templates.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-surface-card py-16">
                <LayoutTemplate className="mb-4 h-12 w-12 text-gray-600" />
                <h2 className="mb-2 text-lg font-medium text-gray-300">No templates found</h2>
                <p className="text-sm text-gray-500">Workflow templates will appear here once published.</p>
              </div>
            ) : (
              <>
                <p className="mb-4 text-xs text-gray-500">
                  {templates.length} template{templates.length !== 1 ? 's' : ''} found
                </p>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {templates.map((t) => (
                    <TemplateCard key={t.id} template={t} onClick={setSelectedTemplate} />
                  ))}
                </div>
              </>
            )
          ) : browseType === 'agents' ? (
            agents.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-surface-card py-16">
                <Store className="mb-4 h-12 w-12 text-gray-600" />
                <h2 className="mb-2 text-lg font-medium text-gray-300">No agents found</h2>
                <p className="text-sm text-gray-500">Try adjusting your search or filters.</p>
              </div>
            ) : (
              <>
                <p className="mb-4 text-xs text-gray-500">
                  {agents.length} agent{agents.length !== 1 ? 's' : ''} found
                </p>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {agents.map((agent) => (
                    <AgentCard key={agent.id} agent={agent} onClick={setSelectedAgent} />
                  ))}
                </div>
              </>
            )
          ) : (
            teams.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-surface-card py-16">
                <Users2 className="mb-4 h-12 w-12 text-gray-600" />
                <h2 className="mb-2 text-lg font-medium text-gray-300">No teams found</h2>
                <p className="text-sm text-gray-500">Try adjusting your search or filters.</p>
              </div>
            ) : (
              <>
                <p className="mb-4 text-xs text-gray-500">
                  {teams.length} team{teams.length !== 1 ? 's' : ''} found
                </p>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {teams.map((team) => (
                    <TeamCard key={team.id} team={team} onClick={setSelectedTeam} />
                  ))}
                </div>
              </>
            )
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
                Publish an agent or team from its detail page to get started.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-surface-card divide-y divide-border/50">
              {mySubmissions.map((sub) => (
                <div key={sub.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-200">
                      {sub.agent_name ?? 'Unknown'}
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

      {/* Detail Modals */}
      <AgentDetailModal
        agent={selectedAgent}
        onClose={() => setSelectedAgent(null)}
        onInstall={handleInstallAgent}
        isInstalling={installAgentMutation.isPending}
      />

      <TeamDetailModal
        team={selectedTeam}
        onClose={() => setSelectedTeam(null)}
        onInstall={handleInstallTeam}
        isInstalling={installTeamMutation.isPending}
      />

      <TemplateInstallModal
        template={selectedTemplate}
        onClose={() => setSelectedTemplate(null)}
        onSuccess={() => {
          setToast({ type: 'success', message: `Template "${selectedTemplate?.name}" installed!` })
          setSelectedTemplate(null)
          setTimeout(() => setToast(null), 4000)
        }}
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
