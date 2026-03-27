// SPDX-License-Identifier: AGPL-3.0-or-later
// A2A Protocol Settings — manage external A2A agent connections

import { useState } from 'react'
import { Plus, Trash2, RefreshCw, ExternalLink, ToggleLeft, ToggleRight, Link2, Loader2 } from 'lucide-react'
import { useWorkspace } from '@/hooks/useWorkspace'
import { useA2AAgents, useDiscoverAgent, useToggleAgent, useDeleteAgent, useRefreshAgentCard } from '@/hooks/useA2AAgents'
import { toast } from 'sonner'

export function A2ASettings() {
  const { workspaceId } = useWorkspace()
  const { data: agents, isLoading } = useA2AAgents(workspaceId ?? undefined)
  const discoverMutation = useDiscoverAgent(workspaceId ?? undefined)
  const toggleMutation = useToggleAgent()
  const deleteMutation = useDeleteAgent()
  const refreshMutation = useRefreshAgentCard()
  const [newUrl, setNewUrl] = useState('')
  const [isAdding, setIsAdding] = useState(false)

  const handleDiscover = async () => {
    if (!newUrl.trim()) return
    try {
      await discoverMutation.mutateAsync(newUrl.trim())
      toast.success('Agent discovered and registered')
      setNewUrl('')
      setIsAdding(false)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to discover agent')
    }
  }

  const handleToggle = async (id: string, currentEnabled: boolean) => {
    try {
      await toggleMutation.mutateAsync({ id, isEnabled: !currentEnabled })
      toast.success(!currentEnabled ? 'Agent enabled' : 'Agent disabled')
    } catch {
      toast.error('Failed to toggle agent')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteMutation.mutateAsync(id)
      toast.success('Agent removed')
    } catch {
      toast.error('Failed to remove agent')
    }
  }

  const handleRefresh = async (id: string, baseUrl: string) => {
    try {
      await refreshMutation.mutateAsync({ id, baseUrl })
      toast.success('Agent Card refreshed')
    } catch {
      toast.error('Failed to refresh Agent Card')
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-gray-100">A2A Protocol</h2>
        <p className="mt-1 text-sm text-gray-400">
          Connect to external AI agents via the{' '}
          <a
            href="https://a2a-protocol.org"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-primary hover:underline inline-flex items-center gap-1"
          >
            Agent-to-Agent protocol
            <ExternalLink className="h-3 w-3" />
          </a>
          . Registered agents can be called using the <code className="text-xs bg-gray-800 px-1 py-0.5 rounded">a2a_delegate</code> tool.
        </p>
      </div>

      {/* Add Agent */}
      {isAdding ? (
        <div className="rounded-lg border border-border bg-card p-4">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Agent Base URL
          </label>
          <div className="flex gap-2">
            <input
              type="url"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="https://example.com"
              className="flex-1 rounded-md border border-border bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-brand-primary focus:outline-none"
              onKeyDown={(e) => { if (e.key === 'Enter') void handleDiscover() }}
            />
            <button
              type="button"
              onClick={() => void handleDiscover()}
              disabled={discoverMutation.isPending || !newUrl.trim()}
              className="rounded-md bg-brand-primary px-4 py-2 text-sm font-medium text-white hover:bg-brand-primary/90 disabled:opacity-50"
            >
              {discoverMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Discover'
              )}
            </button>
            <button
              type="button"
              onClick={() => { setIsAdding(false); setNewUrl('') }}
              className="rounded-md border border-border px-3 py-2 text-sm text-gray-400 hover:text-gray-200"
            >
              Cancel
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Fetches the Agent Card from <code>/.well-known/agent.json</code>
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-2 rounded-md border border-dashed border-border px-4 py-3 text-sm text-gray-400 hover:border-brand-primary hover:text-gray-200 transition-colors w-full justify-center"
        >
          <Plus className="h-4 w-4" />
          Add External Agent
        </button>
      )}

      {/* Agent List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : agents && agents.length > 0 ? (
        <div className="space-y-3">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className="rounded-lg border border-border bg-card p-4 hover:border-gray-600 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Link2 className="h-4 w-4 text-brand-primary shrink-0" />
                    <h3 className="text-sm font-semibold text-gray-100 truncate">
                      {agent.name}
                    </h3>
                    {agent.agent_card.version && (
                      <span className="text-xs text-gray-500">v{agent.agent_card.version}</span>
                    )}
                    <span
                      className={`ml-auto text-xs px-2 py-0.5 rounded-full ${
                        agent.is_enabled
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : 'bg-gray-700 text-gray-400'
                      }`}
                    >
                      {agent.is_enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>

                  {agent.agent_card.description && (
                    <p className="mt-1 text-xs text-gray-400 line-clamp-2">
                      {agent.agent_card.description}
                    </p>
                  )}

                  <div className="mt-2 text-xs text-gray-500 truncate">
                    {agent.base_url}
                  </div>

                  {/* Skills */}
                  {agent.agent_card.skills && agent.agent_card.skills.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {agent.agent_card.skills.slice(0, 5).map((skill) => (
                        <span
                          key={skill.id}
                          className="inline-flex items-center rounded-md bg-gray-800 px-2 py-0.5 text-xs text-gray-300"
                          title={skill.description}
                        >
                          {skill.name}
                        </span>
                      ))}
                      {agent.agent_card.skills.length > 5 && (
                        <span className="text-xs text-gray-500">
                          +{agent.agent_card.skills.length - 5} more
                        </span>
                      )}
                    </div>
                  )}

                  {/* Agent ID for tool use */}
                  <div className="mt-2 flex items-center gap-1">
                    <span className="text-xs text-gray-500">ID:</span>
                    <code className="text-xs bg-gray-800 px-1.5 py-0.5 rounded text-gray-300 select-all">
                      {agent.id}
                    </code>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => void handleToggle(agent.id, agent.is_enabled)}
                    className="p-1.5 text-gray-400 hover:text-gray-200 transition-colors"
                    title={agent.is_enabled ? 'Disable' : 'Enable'}
                  >
                    {agent.is_enabled ? (
                      <ToggleRight className="h-5 w-5 text-emerald-400" />
                    ) : (
                      <ToggleLeft className="h-5 w-5" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRefresh(agent.id, agent.base_url)}
                    className="p-1.5 text-gray-400 hover:text-gray-200 transition-colors"
                    title="Refresh Agent Card"
                  >
                    <RefreshCw className={`h-4 w-4 ${refreshMutation.isPending ? 'animate-spin' : ''}`} />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(agent.id)}
                    className="p-1.5 text-gray-400 hover:text-red-400 transition-colors"
                    title="Remove agent"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border py-8 text-center">
          <Link2 className="mx-auto h-8 w-8 text-gray-600" />
          <p className="mt-2 text-sm text-gray-400">No external agents connected</p>
          <p className="mt-1 text-xs text-gray-500">
            Add an A2A-compatible agent URL to get started
          </p>
        </div>
      )}
    </div>
  )
}
