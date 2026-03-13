// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useState, useMemo } from 'react'
import { KeyRound, User, Building2, Webhook, Users, ScrollText, CreditCard, MessageSquareText, ShieldCheck, Brain } from 'lucide-react'
import { ApiKeysSettings } from '@/components/settings/ApiKeysSettings'
import { RestApiKeysSettings } from '@/components/settings/RestApiKeysSettings'
import { WebhooksSettings } from '@/components/settings/WebhooksSettings'
import { MembersSettings } from '@/components/settings/MembersSettings'
import { WorkspaceSettings } from '@/components/settings/WorkspaceSettings'
import { AuditLogPanel } from '@/components/settings/AuditLogPanel'
import { AuditStreamingSettings } from '@/components/settings/AuditStreamingSettings'
import { BillingSettings } from '@/components/settings/BillingSettings'
import { ProfileSettings } from '@/components/settings/ProfileSettings'
import { MessagingChannelsSettings } from '@/components/settings/MessagingChannelsSettings'
import { LicenseActivation } from '@/components/settings/LicenseActivation'
import { useWorkspace } from '@/hooks/useWorkspace'
import { useEELicense } from '@/hooks/useEELicense'
import { cn } from '@/lib/utils'

type SettingsTab = 'llm-setup' | 'api-keys' | 'webhooks' | 'channels' | 'members' | 'workspace' | 'billing' | 'audit-log' | 'profile' | 'license'

const settingsTabs: { key: SettingsTab; label: string; icon: typeof KeyRound; eeFeature?: string }[] = [
  { key: 'llm-setup', label: 'LLM Setup', icon: Brain },
  { key: 'api-keys', label: 'API Keys', icon: KeyRound },
  { key: 'webhooks', label: 'Webhooks', icon: Webhook },
  { key: 'channels', label: 'Channels', icon: MessageSquareText, eeFeature: 'messaging_channels' },
  { key: 'members', label: 'Members', icon: Users, eeFeature: 'rbac' },
  { key: 'workspace', label: 'Workspace', icon: Building2 },
  { key: 'billing', label: 'Billing', icon: CreditCard },
  { key: 'audit-log', label: 'Audit Log', icon: ScrollText, eeFeature: 'audit_logs' },
  { key: 'license', label: 'License', icon: ShieldCheck },
  { key: 'profile', label: 'Profile', icon: User },
]

export function Settings() {
  const { workspaceId } = useWorkspace()
  const { hasFeature } = useEELicense(workspaceId ?? undefined)
  const [activeTab, setActiveTab] = useState<SettingsTab>('llm-setup')

  // Filter tabs based on EE license
  const visibleTabs = useMemo(() =>
    settingsTabs.filter(t => !t.eeFeature || hasFeature(t.eeFeature)),
    [hasFeature],
  )

  return (
    <div className="p-6 lg:p-8">
      <h1 className="mb-6 text-2xl font-semibold text-gray-100">Settings</h1>

      {/* Tabs */}
      <div className="mb-6 flex overflow-x-auto border-b border-border">
        {visibleTabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={cn(
              'flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
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
      <div className={cn('mx-auto', activeTab === 'billing' ? 'max-w-4xl' : 'max-w-2xl')}>
        {activeTab === 'llm-setup' && <ApiKeysSettings />}

        {activeTab === 'api-keys' && <RestApiKeysSettings />}

        {activeTab === 'webhooks' && <WebhooksSettings />}

        {activeTab === 'channels' && <MessagingChannelsSettings />}

        {activeTab === 'members' && <MembersSettings />}

        {activeTab === 'workspace' && <WorkspaceSettings />}

        {activeTab === 'billing' && <BillingSettings />}

        {activeTab === 'audit-log' && (
          <>
            <AuditStreamingSettings />
            <hr className="my-8 border-border" />
            <AuditLogPanel />
          </>
        )}

        {activeTab === 'license' && <LicenseActivation />}

        {activeTab === 'profile' && <ProfileSettings />}
      </div>
    </div>
  )
}
