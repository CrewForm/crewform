// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useState, useCallback, useEffect, Suspense, lazy } from 'react'
import { Outlet, NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Bot,
  Users,
  ListTodo,
  Store,
  BookOpen,
  BarChart3,
  Settings,
  LogOut,
  X,
  Shield,
  ChevronDown,
  KeyRound,
  Building2,
  Webhook,
  ScrollText,
  CreditCard,
  MessageSquareText,
  ShieldCheck,
  Brain,
  Zap,
  Plug,
  Link2,
  MessageCircle,
  User,
  Activity,
  AlertTriangle,
  PackageOpen,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { useSuperAdmin } from '@/hooks/useAdmin'
import { useIsMobile, useIsTablet } from '@/hooks/useMediaQuery'
import { TopBar } from '@/components/layout/TopBar'
import { MobileNav } from '@/components/layout/MobileNav'
import { useWorkspace } from '@/hooks/useWorkspace'
import { useEELicense } from '@/hooks/useEELicense'
import { PageSkeleton } from '@/components/ui/PageSkeleton'

const FeedbackWidget = lazy(() =>
  import('@/components/shared/FeedbackWidget').then((m) => ({ default: m.FeedbackWidget }))
)

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/agents', icon: Bot, label: 'Agents' },
  { to: '/teams', icon: Users, label: 'Teams' },
  { to: '/tasks', icon: ListTodo, label: 'Tasks' },
  { to: '/knowledge', icon: BookOpen, label: 'Knowledge' },
  { to: '/marketplace', icon: Store, label: 'Marketplace' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
] as const

/** Settings sub-navigation items grouped by category */
const settingsSubNav: {
  category?: string
  items: { to: string; icon: typeof KeyRound; label: string; eeFeature?: string }[]
}[] = [
  {
    items: [
      { to: '/settings', icon: Brain, label: 'LLM Setup' },
      { to: '/settings/api-keys', icon: KeyRound, label: 'API Keys' },
      { to: '/settings/webhooks', icon: Webhook, label: 'Webhooks' },
    ],
  },
  {
    category: 'Integrations',
    items: [
      { to: '/settings/channels', icon: MessageSquareText, label: 'Channels', eeFeature: 'messaging_channels' },
      { to: '/settings/mcp-servers', icon: Plug, label: 'MCP Servers' },
      { to: '/settings/a2a', icon: Link2, label: 'A2A Protocol' },
      { to: '/settings/automations', icon: Zap, label: 'Automations' },
      { to: '/settings/chat-widget', icon: MessageCircle, label: 'Chat Widget', eeFeature: 'chat_widget' },
    ],
  },
  {
    category: 'Workspace',
    items: [
      { to: '/settings/members', icon: Users, label: 'Members', eeFeature: 'rbac' },
      { to: '/settings/workspace', icon: Building2, label: 'Workspace' },
      { to: '/settings/billing', icon: CreditCard, label: 'Billing' },
      { to: '/settings/audit-log', icon: ScrollText, label: 'Audit Log' },
      { to: '/settings/license', icon: ShieldCheck, label: 'License' },
      { to: '/settings/profile', icon: User, label: 'Profile' },
    ],
  },
]

/** Admin sub-navigation items */
const adminSubNav: { to: string; icon: typeof BarChart3; label: string }[] = [
  { to: '/admin', icon: BarChart3, label: 'Overview' },
  { to: '/admin/workspaces', icon: Building2, label: 'Workspaces' },
  { to: '/admin/abuse', icon: AlertTriangle, label: 'Abuse' },
  { to: '/admin/activity', icon: Activity, label: 'Activity' },
  { to: '/admin/beta-users', icon: Users, label: 'Beta Users' },
  { to: '/admin/licenses', icon: ShieldCheck, label: 'Licenses' },
  { to: '/admin/marketplace', icon: Store, label: 'Marketplace' },
  { to: '/admin/review-queue', icon: PackageOpen, label: 'Review Queue' },
]

export function RootLayout() {
  const { user, signOut } = useAuth()
  const { isSuperAdmin } = useSuperAdmin()
  const { workspace, isSuspended, workspaceId } = useWorkspace()
  const { hasFeature } = useEELicense(workspaceId ?? undefined)
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const isOnSettings = location.pathname === '/settings' || location.pathname.startsWith('/settings/')
  const isOnAdmin = location.pathname === '/admin' || location.pathname.startsWith('/admin/')
  const [settingsExpanded, setSettingsExpanded] = useState(isOnSettings)
  const [adminExpanded, setAdminExpanded] = useState(isOnAdmin)

  // Auto-expand collapsible sections when navigating to them
  useEffect(() => {
    if (isOnSettings) setSettingsExpanded(true)
    if (isOnAdmin) setAdminExpanded(true)
  }, [isOnSettings, isOnAdmin])

  const metadata = (user?.user_metadata ?? {}) as Record<string, unknown>
  const displayName = (typeof metadata.full_name === 'string' ? metadata.full_name : null)
    ?? (typeof metadata.name === 'string' ? metadata.name : null)
    ?? user?.email
    ?? 'User'

  const avatarInitial = displayName.charAt(0).toUpperCase()
  const avatarUrl = typeof metadata.avatar_url === 'string' ? metadata.avatar_url : undefined

  // Close mobile sidebar on route change
  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev)
  }, [])

  // ─── Suspension Gate ────────────────────────────────────────────────────────
  // Super admins bypass the gate so they can still access the admin panel.
  if (isSuspended && !isSuperAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950 p-6">
        <div className="mx-auto max-w-md rounded-2xl border border-red-500/30 bg-gray-900 p-8 text-center shadow-2xl">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10">
            <Shield className="h-7 w-7 text-red-400" />
          </div>
          <h1 className="mb-2 text-2xl font-bold text-gray-100">Workspace Suspended</h1>
          <p className="mb-4 text-sm text-gray-400">
            This workspace has been suspended by a platform administrator.
          </p>
          {workspace?.suspended_reason && (
            <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300">
              <strong className="block text-xs uppercase tracking-wider text-red-400 mb-1">Reason</strong>
              {workspace.suspended_reason}
            </div>
          )}
          <p className="mb-6 text-xs text-gray-500">
            If you believe this is an error, please contact support at{' '}
            <a href="mailto:team@crewform.tech" className="text-brand-primary hover:underline">
              team@crewform.tech
            </a>.
          </p>
          <button
            type="button"
            onClick={() => void signOut()}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-700"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </div>
    )
  }

  // Collapsed mode: icon-only on tablet
  const collapsed = isTablet

  return (
    <div className="flex h-screen overflow-hidden bg-gray-950">
      {/* Backdrop overlay for mobile sidebar */}
      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 transition-opacity"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'flex flex-col border-r border-gray-800 bg-gray-900 transition-all duration-200',
          // Desktop: full sidebar
          !isMobile && !collapsed && 'w-64',
          // Tablet: collapsed icon-only sidebar
          !isMobile && collapsed && 'w-16',
          // Mobile: slide-over drawer
          isMobile && 'fixed inset-y-0 left-0 z-50 w-64',
          isMobile && sidebarOpen && 'translate-x-0',
          isMobile && !sidebarOpen && '-translate-x-full',
        )}
      >
        {/* Logo */}
        <div className={cn(
          'flex h-14 shrink-0 items-center border-b border-gray-800',
          collapsed ? 'justify-center px-2' : 'gap-2 px-6',
        )}>
          <img src="/crewform-icon.png" alt="CrewForm" className="h-8 w-8 shrink-0 rounded-lg" />
          {!collapsed && (
            <span className="text-lg font-semibold text-gray-100">CrewForm</span>
          )}
          {/* Close button for mobile drawer */}
          {isMobile && (
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="ml-auto rounded-lg p-1 text-gray-400 hover:text-gray-200"
              aria-label="Close sidebar"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Navigation */}
        <nav className={cn('flex-1 overflow-y-auto py-4', collapsed ? 'px-2' : 'px-3')}>
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center rounded-lg text-sm font-medium transition-colors',
                  collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2',
                  isActive
                    ? 'bg-gray-800 text-gray-100'
                    : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200',
                )
              }
              title={collapsed ? label : undefined}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {!collapsed && label}
            </NavLink>
          ))}

          {/* ─── Settings collapsible group ─── */}
          {collapsed ? (
            /* Collapsed: single settings icon */
            <NavLink
              to="/settings"
              className={cn(
                'flex items-center justify-center rounded-lg p-2.5 text-sm font-medium transition-colors',
                isOnSettings
                  ? 'bg-gray-800 text-gray-100'
                  : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200',
              )}
              title="Settings"
            >
              <Settings className="h-5 w-5 shrink-0" />
            </NavLink>
          ) : (
            /* Expanded: collapsible settings section */
            <div className="mt-1">
              <button
                type="button"
                onClick={() => setSettingsExpanded(prev => !prev)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isOnSettings
                    ? 'bg-gray-800 text-gray-100'
                    : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200',
                )}
              >
                <Settings className="h-5 w-5 shrink-0" />
                <span className="flex-1 text-left">Settings</span>
                <ChevronDown
                  className={cn(
                    'h-4 w-4 shrink-0 transition-transform duration-200',
                    settingsExpanded && 'rotate-180',
                  )}
                />
              </button>

              {/* Sub-navigation items */}
              <div
                className={cn(
                  'overflow-hidden transition-all duration-200',
                  settingsExpanded ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0',
                )}
              >
                <div className="mt-1 space-y-0.5 pl-2">
                  {settingsSubNav.map((group, gi) => (
                    <div key={gi}>
                      {group.category && (
                        <div className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-gray-600">
                          {group.category}
                        </div>
                      )}
                      {group.items
                        .filter(item => !item.eeFeature || hasFeature(item.eeFeature))
                        .map(({ to, icon: Icon, label }) => (
                          <NavLink
                            key={to}
                            to={to}
                            end
                            className={({ isActive }) =>
                              cn(
                                'flex items-center gap-2.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors',
                                isActive
                                  ? 'bg-gray-800/80 text-gray-200'
                                  : 'text-gray-500 hover:bg-gray-800/40 hover:text-gray-300',
                              )
                            }
                          >
                            <Icon className="h-3.5 w-3.5 shrink-0" />
                            {label}
                          </NavLink>
                        ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ─── Admin collapsible group (super admin only) ─── */}
          {isSuperAdmin && (
            collapsed ? (
              <NavLink
                to="/admin"
                className={cn(
                  'flex items-center justify-center rounded-lg p-2.5 text-sm font-medium transition-colors',
                  isOnAdmin
                    ? 'bg-gray-800 text-gray-100'
                    : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200',
                )}
                title="Admin"
              >
                <Shield className="h-5 w-5 shrink-0" />
              </NavLink>
            ) : (
              <div className="mt-1">
                <button
                  type="button"
                  onClick={() => setAdminExpanded(prev => !prev)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isOnAdmin
                      ? 'bg-gray-800 text-gray-100'
                      : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200',
                  )}
                >
                  <Shield className="h-5 w-5 shrink-0" />
                  <span className="flex-1 text-left">Admin</span>
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 shrink-0 transition-transform duration-200',
                      adminExpanded && 'rotate-180',
                    )}
                  />
                </button>

                <div
                  className={cn(
                    'overflow-hidden transition-all duration-200',
                    adminExpanded ? 'max-h-[400px] opacity-100' : 'max-h-0 opacity-0',
                  )}
                >
                  <div className="mt-1 space-y-0.5 pl-2">
                    {adminSubNav.map(({ to, icon: Icon, label }) => (
                      <NavLink
                        key={to}
                        to={to}
                        end
                        className={({ isActive }) =>
                          cn(
                            'flex items-center gap-2.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors',
                            isActive
                              ? 'bg-gray-800/80 text-gray-200'
                              : 'text-gray-500 hover:bg-gray-800/40 hover:text-gray-300',
                          )
                        }
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        {label}
                      </NavLink>
                    ))}
                  </div>
                </div>
              </div>
            )
          )}
        </nav>

        {/* User footer — hidden when collapsed */}
        {!collapsed && (
          <div className="border-t border-gray-800 p-4">
            <div className="flex items-center gap-3">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={displayName}
                  className="h-8 w-8 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-800 text-sm font-medium text-gray-300">
                  {avatarInitial}
                </div>
              )}
              <div className="flex-1 truncate">
                <p className="truncate text-sm text-gray-300">{displayName}</p>
                {user?.email && displayName !== user.email && (
                  <p className="truncate text-xs text-gray-500">{user.email}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => void signOut()}
                title="Sign out"
                className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-300"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Collapsed footer — just sign out icon */}
        {collapsed && (
          <div className="border-t border-gray-800 p-2">
            <button
              type="button"
              onClick={() => void signOut()}
              title="Sign out"
              className="flex w-full items-center justify-center rounded-lg p-2.5 text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-300"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        )}
      </aside>

      {/* Main content area */}
      <div className={cn('flex flex-1 flex-col overflow-hidden', isMobile && 'pb-14')}>
        {/* Top bar */}
        <TopBar onMenuToggle={toggleSidebar} isMobile={isMobile} />

        {/* Page content with skeleton fallback */}
        <main className="flex-1 overflow-auto">
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      {/* Mobile bottom navigation */}
      {isMobile && <MobileNav />}

      {/* Global feedback widget */}
      <Suspense fallback={null}>
        <FeedbackWidget />
      </Suspense>
    </div>
  )
}
