// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
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
import { ZapierAutomations } from '@/components/settings/ZapierAutomations'
import { McpServersSettings } from '@/components/settings/McpServersSettings'
import { A2ASettings } from '@/components/settings/A2ASettings'
import { LicenseActivation } from '@/components/settings/LicenseActivation'
import { ChatWidgetSettings } from '@/components/settings/ChatWidgetSettings'
import { useWorkspace } from '@/hooks/useWorkspace'
import { useEELicense } from '@/hooks/useEELicense'
import { cn } from '@/lib/utils'

type SettingsTab = 'llm-setup' | 'api-keys' | 'webhooks' | 'channels' | 'members' | 'workspace' | 'billing' | 'audit-log' | 'automations' | 'mcp-servers' | 'a2a' | 'chat-widget' | 'profile' | 'license'

const validTabs = new Set<string>([
  'llm-setup', 'api-keys', 'webhooks', 'channels', 'members', 'workspace',
  'billing', 'audit-log', 'automations', 'mcp-servers', 'a2a', 'chat-widget',
  'profile', 'license',
])

export function Settings() {
  const { workspaceId } = useWorkspace()
  const { hasFeature } = useEELicense(workspaceId ?? undefined)
  const { tab: tabParam } = useParams<{ tab?: string }>()

  // Resolve active tab from URL param, defaulting to llm-setup
  const activeTab = useMemo<SettingsTab>(() => {
    if (tabParam && validTabs.has(tabParam)) return tabParam as SettingsTab
    return 'llm-setup'
  }, [tabParam])

  // EE feature gate check
  const isTabGated = useMemo(() => {
    const eeGates: Partial<Record<SettingsTab, string>> = {
      channels: 'messaging_channels',
      members: 'rbac',
      'chat-widget': 'chat_widget',
    }
    const gate = eeGates[activeTab]
    return gate ? !hasFeature(gate) : false
  }, [activeTab, hasFeature])

  if (isTabGated) {
    return (
      <div className="p-6 lg:p-8">
        <div className="mx-auto max-w-2xl rounded-xl border border-border bg-surface-card p-8 text-center">
          <p className="text-gray-400">This feature requires an Enterprise license.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 lg:p-8">
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

        {activeTab === 'automations' && <ZapierAutomations />}

        {activeTab === 'mcp-servers' && <McpServersSettings />}

        {activeTab === 'a2a' && <A2ASettings />}

        {activeTab === 'chat-widget' && <ChatWidgetSettings />}

        {activeTab === 'profile' && <ProfileSettings />}
      </div>
    </div>
  )
}
