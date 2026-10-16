// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm

import { useEffect, useRef } from 'react'
import { useAgents } from '@/hooks/useAgents'
import { useWorkspace } from '@/hooks/useWorkspace'
import { MarkdownContent } from '@/components/shared/MarkdownContent'
import { cn } from '@/lib/utils'

interface TeamMessage {
    id: string
    run_id: string
    sender_agent_id: string | null
    message_type: string
    content: string
    metadata: Record<string, unknown> | null
    created_at: string
}

interface CollaborationChatViewProps {
    messages: TeamMessage[]
    isLive?: boolean
}

// Agent color palette for distinguishing speakers
const AGENT_COLORS = [
    { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400', dot: 'bg-blue-400' },
    { bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-400', dot: 'bg-purple-400' },
    { bg: 'bg-green-500/10', border: 'border-green-500/30', text: 'text-green-400', dot: 'bg-green-400' },
    { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400', dot: 'bg-amber-400' },
    { bg: 'bg-pink-500/10', border: 'border-pink-500/30', text: 'text-pink-400', dot: 'bg-pink-400' },
    { bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', text: 'text-cyan-400', dot: 'bg-cyan-400' },
    { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400', dot: 'bg-red-400' },
    { bg: 'bg-indigo-500/10', border: 'border-indigo-500/30', text: 'text-indigo-400', dot: 'bg-indigo-400' },
]

/**
 * Real-time chat-style view for collaboration team runs.
 * Shows messages in a threaded conversation format with color-coded agents.
 */
export function CollaborationChatView({ messages, isLive = false }: CollaborationChatViewProps) {
    const { workspaceId } = useWorkspace()
    const { agents } = useAgents(workspaceId)
    const scrollRef = useRef<HTMLDivElement>(null)

    // Build agent lookup and color map
    const agentMap = new Map(agents.map((a) => [a.id, a]))
    const colorMap = new Map<string, typeof AGENT_COLORS[number]>()
    let colorIdx = 0

    function getAgentColor(agentId: string) {
        if (!colorMap.has(agentId)) {
            colorMap.set(agentId, AGENT_COLORS[colorIdx % AGENT_COLORS.length])
            colorIdx++
        }
        return colorMap.get(agentId) ?? AGENT_COLORS[0]
    }

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
    }, [messages.length])

    if (messages.length === 0) {
        return (
            <div className="rounded-lg border border-dashed border-border py-8 text-center">
                <p className="text-sm text-gray-500">No messages yet.</p>
                {isLive && (
                    <p className="mt-1 text-xs text-gray-600">Waiting for agents to start discussing...</p>
                )}
            </div>
        )
    }

    return (
        <div className="flex flex-col rounded-xl border border-border bg-surface-card">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <h3 className="text-sm font-medium text-gray-300">Discussion Thread</h3>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">
                        {messages.filter((m) => m.message_type === 'discussion').length} turns
                    </span>
                    {isLive && (
                        <span className="flex items-center gap-1 text-xs text-green-400">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-400" />
                            Live
                        </span>
                    )}
                </div>
            </div>

            {/* Messages */}
            <div
                ref={scrollRef}
                className="max-h-[500px] overflow-y-auto p-4 space-y-3"
            >
                {messages.map((msg) => {
                    // System messages
                    if (!msg.sender_agent_id || msg.message_type === 'system') {
                        return (
                            <div key={msg.id} className="flex justify-center">
                                <span className="rounded-full bg-gray-800 px-3 py-1 text-[10px] text-gray-500">
                                    {msg.content}
                                </span>
                            </div>
                        )
                    }

                    // Agent discussion messages
                    const agent = agentMap.get(msg.sender_agent_id)
                    const color = getAgentColor(msg.sender_agent_id)
                    const turnIndex = (msg.metadata?.turn_index as number | undefined) ?? null
                    const tokens = (msg.metadata?.tokens as number | undefined) ?? null

                    return (
                        <div
                            key={msg.id}
                            className={cn(
                                'rounded-lg border p-3',
                                color.bg,
                                color.border,
                            )}
                        >
                            {/* Agent name + metadata */}
                            <div className="mb-1.5 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className={cn('h-2 w-2 rounded-full', color.dot)} />
                                    <span className={cn('text-xs font-medium', color.text)}>
                                        {agent?.name ?? 'Unknown Agent'}
                                    </span>
                                    {turnIndex !== null && (
                                        <span className="text-[10px] text-gray-600">
                                            Turn {turnIndex + 1}
                                        </span>
                                    )}
                                </div>
                                {tokens !== null && (
                                    <span className="text-[10px] text-gray-600">
                                        {tokens.toLocaleString()} tokens
                                    </span>
                                )}
                            </div>

                            {/* Message content */}
                            <MarkdownContent content={msg.content} />
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
