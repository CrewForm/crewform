// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import { RootLayout } from '@/layouts/RootLayout'
import { AuthGuard } from '@/components/auth/AuthGuard'
import { AdminGuard } from '@/components/auth/AdminGuard'
import { Toaster } from '@/components/ui/sonner'
import { Loader2 } from 'lucide-react'

// ── Lazy-loaded pages ────────────────────────────────────────────────────────
const Dashboard = lazy(() => import('@/pages/Dashboard').then(m => ({ default: m.Dashboard })))
const Agents = lazy(() => import('@/pages/Agents').then(m => ({ default: m.Agents })))
const Teams = lazy(() => import('@/pages/Teams').then(m => ({ default: m.Teams })))
const Tasks = lazy(() => import('@/pages/Tasks').then(m => ({ default: m.Tasks })))
const Marketplace = lazy(() => import('@/pages/Marketplace').then(m => ({ default: m.Marketplace })))
const Settings = lazy(() => import('@/pages/Settings').then(m => ({ default: m.Settings })))
const Auth = lazy(() => import('@/pages/Auth').then(m => ({ default: m.Auth })))
const AuthCallback = lazy(() => import('@/pages/AuthCallback').then(m => ({ default: m.AuthCallback })))
const CreateAgent = lazy(() => import('@/pages/CreateAgent').then(m => ({ default: m.CreateAgent })))
const AgentDetail = lazy(() => import('@/pages/AgentDetail').then(m => ({ default: m.AgentDetail })))
const TaskDetail = lazy(() => import('@/pages/TaskDetail').then(m => ({ default: m.TaskDetail })))
const TeamDetail = lazy(() => import('@/pages/TeamDetail').then(m => ({ default: m.TeamDetail })))
const TeamRunDetail = lazy(() => import('@/pages/TeamRunDetail').then(m => ({ default: m.TeamRunDetail })))
const Analytics = lazy(() => import('@/pages/Analytics').then(m => ({ default: m.Analytics })))
const AdminPanel = lazy(() => import('@/pages/AdminPanel').then(m => ({ default: m.AdminPanel })))

// ── Suspense fallback ────────────────────────────────────────────────────────
function PageLoader() {
  return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
    </div>
  )
}

export function App() {
  return (
    <>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Auth routes — public */}
          <Route path="/auth" element={<Auth />} />
          <Route path="/auth/signup" element={<Auth />} />
          <Route path="/auth/forgot-password" element={<Auth />} />
          <Route path="/auth/reset-password" element={<Auth />} />
          <Route path="/auth/callback" element={<AuthCallback />} />

          {/* App routes — protected */}
          <Route
            element={
              <AuthGuard>
                <RootLayout />
              </AuthGuard>
            }
          >
            <Route path="/" element={<Dashboard />} />
            <Route path="/agents" element={<Agents />} />
            <Route path="/agents/new" element={<CreateAgent />} />
            <Route path="/agents/:id" element={<AgentDetail />} />
            <Route path="/teams" element={<Teams />} />
            <Route path="/teams/:id" element={<TeamDetail />} />
            <Route path="/teams/:teamId/runs/:runId" element={<TeamRunDetail />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/tasks/:id" element={<TaskDetail />} />
            <Route path="/marketplace" element={<Marketplace />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/settings" element={<Settings />} />

            {/* Admin — super admin only */}
            <Route path="/admin" element={<AdminGuard><AdminPanel /></AdminGuard>} />
          </Route>
        </Routes>
      </Suspense>
      <Toaster />
    </>
  )
}
