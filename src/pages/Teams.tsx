// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useState } from 'react'
import { Users, Plus } from 'lucide-react'
import { useWorkspace } from '@/hooks/useWorkspace'
import { useTeams } from '@/hooks/useTeams'
import { TeamCard } from '@/components/teams/TeamCard'
import { CreateTeamModal } from '@/components/teams/CreateTeamModal'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/shared/ErrorState'
import { RoleGate } from '@/components/ui/RoleGate'

export function Teams() {
  const { workspaceId } = useWorkspace()
  const { teams, isLoading, error, refetch } = useTeams(workspaceId)
  const [showCreateModal, setShowCreateModal] = useState(false)

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6 text-brand-primary" />
          <h1 className="text-2xl font-semibold text-gray-100">Teams</h1>
          {!isLoading && teams.length > 0 && (
            <span className="rounded-full bg-surface-elevated px-2.5 py-0.5 text-xs font-medium text-gray-400">
              {teams.length}
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
            New Team
          </button>
        </RoleGate>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-xl" />
          ))}
        </div>
      )}

      {/* Team grid */}
      {!isLoading && error && (
        <ErrorState
          message={error instanceof Error ? error.message : 'Failed to load teams'}
          onRetry={() => void refetch()}
        />
      )}

      {!isLoading && !error && teams.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((team) => (
            <TeamCard key={team.id} team={team} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && teams.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-surface-card py-16">
          <Users className="mb-4 h-12 w-12 text-gray-600" />
          <h2 className="mb-2 text-lg font-medium text-gray-300">
            No teams yet
          </h2>
          <p className="mb-4 max-w-md text-center text-sm text-gray-500">
            Teams let multiple agents work together — in sequence, under a coordinator, or collaboratively.
          </p>
          <RoleGate minRole="member">
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-brand-hover"
            >
              <Plus className="h-4 w-4" />
              Create First Team
            </button>
          </RoleGate>
        </div>
      )}

      {/* Create modal */}
      {showCreateModal && (
        <CreateTeamModal onClose={() => setShowCreateModal(false)} />
      )}
    </div>
  )
}
