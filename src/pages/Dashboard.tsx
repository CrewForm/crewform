// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import {
  LayoutDashboard,
  ListTodo,
  Loader2,
  CheckCircle2,
  XCircle,
  Coins,
  GitBranch,
} from 'lucide-react'
import { useWorkspace } from '@/hooks/useWorkspace'
import { useAuth } from '@/hooks/useAuth'
import { useDashboardStats, useAgentPerformance, useTeamPerformance, useRecentActivity } from '@/hooks/useDashboard'
import { StatCard } from '@/components/dashboard/StatCard'
import { AgentPerformanceGrid } from '@/components/dashboard/AgentPerformanceGrid'
import { TeamPerformanceGrid } from '@/components/dashboard/TeamPerformanceGrid'
import { ActivityTimeline } from '@/components/dashboard/ActivityTimeline'
import { QuickActions } from '@/components/dashboard/QuickActions'
import { ErrorState } from '@/components/shared/ErrorState'
import { RoleGate } from '@/components/ui/RoleGate'
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard'

/**
 * Dashboard page — stat cards, agent performance grid, activity timeline, quick actions.
 * Shows onboarding wizard for first-time users with empty workspaces.
 */
export function Dashboard() {
  const { workspace, workspaceId } = useWorkspace()
  const { user } = useAuth()
  const { stats, isLoading: isLoadingStats, error: statsError } = useDashboardStats(workspaceId)
  const { agents: performanceAgents, isLoading: isLoadingAgents } = useAgentPerformance(workspaceId)
  const { teams: performanceTeams, isLoading: isLoadingTeams } = useTeamPerformance(workspaceId)
  const { activity, isLoading: isLoadingActivity } = useRecentActivity(workspaceId)

  // Show onboarding only for workspace owners who haven't completed it yet.
  // Invited members (non-owners) skip onboarding — they join an already-configured workspace.
  const isOwner = workspace?.owner_id === user?.id
  const onboardingCompleted = workspace?.settings.onboarding_completed === true
  const showOnboarding = isOwner && !onboardingCompleted

  if (showOnboarding) {
    return <OnboardingWizard />
  }

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <LayoutDashboard className="h-6 w-6 text-brand-primary" />
          <h1 className="text-2xl font-semibold text-gray-100">Dashboard</h1>
        </div>
        <p className="text-sm text-gray-500">{today}</p>
      </div>

      {/* Error state */}
      {statsError && (
        <div className="mb-8">
          <ErrorState
            message={statsError instanceof Error ? statsError.message : 'Failed to load dashboard data'}
          />
        </div>
      )}

      {/* Stat cards */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Tasks This Month"
          value={stats?.tasksThisMonth ?? 0}
          icon={ListTodo}
          accentColor="border-l-brand-primary"
          isLoading={isLoadingStats}
        />
        <StatCard
          label="Running"
          value={stats?.tasksRunning ?? 0}
          icon={Loader2}
          accentColor="border-l-blue-500"
          isLoading={isLoadingStats}
        />
        <StatCard
          label="Completed"
          value={stats?.tasksCompleted ?? 0}
          icon={CheckCircle2}
          accentColor="border-l-green-500"
          isLoading={isLoadingStats}
        />
        <StatCard
          label="Failed"
          value={stats?.tasksFailed ?? 0}
          icon={XCircle}
          accentColor="border-l-red-500"
          isLoading={isLoadingStats}
        />
      </div>

      {/* Team run stat cards */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Team Runs This Month"
          value={stats?.teamRunsThisMonth ?? 0}
          icon={GitBranch}
          accentColor="border-l-violet-500"
          isLoading={isLoadingStats}
        />
        <StatCard
          label="Runs Running"
          value={stats?.teamRunsRunning ?? 0}
          icon={Loader2}
          accentColor="border-l-purple-500"
          isLoading={isLoadingStats}
        />
        <StatCard
          label="Runs Completed"
          value={stats?.teamRunsCompleted ?? 0}
          icon={CheckCircle2}
          accentColor="border-l-emerald-500"
          isLoading={isLoadingStats}
        />
        <StatCard
          label="Runs Failed"
          value={stats?.teamRunsFailed ?? 0}
          icon={XCircle}
          accentColor="border-l-rose-500"
          isLoading={isLoadingStats}
        />
      </div>

      {/* Cost card */}
      {stats && stats.estimatedCostUsd > 0 && (
        <div className="mb-8 rounded-lg border border-border border-l-4 border-l-amber-500 bg-surface-card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-400">Estimated Cost This Month</p>
              <p className="mt-1 text-2xl font-bold text-gray-100">
                ${stats.estimatedCostUsd.toFixed(4)}
              </p>
            </div>
            <Coins className="h-6 w-6 text-amber-500" />
          </div>
        </div>
      )}

      {/* Two-column: Performance + Activity Timeline */}
      <div className="mb-8 grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* Performance */}
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-surface-card p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
              Agent Performance
            </h2>
            <AgentPerformanceGrid agents={performanceAgents} isLoading={isLoadingAgents} />
          </div>
          <div className="rounded-xl border border-border bg-surface-card p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
              Team Performance
            </h2>
            <TeamPerformanceGrid teams={performanceTeams} isLoading={isLoadingTeams} />
          </div>
        </div>

        {/* Activity Timeline */}
        <div className="rounded-xl border border-border bg-surface-card p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
            Recent Activity
          </h2>
          <ActivityTimeline activity={activity} isLoading={isLoadingActivity} />
        </div>
      </div>

      {/* Quick Actions — hidden for viewers */}
      <RoleGate minRole="member">
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
            Quick Actions
          </h2>
          <QuickActions />
        </div>
      </RoleGate>
    </div>
  )
}
