// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

/**
 * Live transcript/message feed panel for the workflow canvas.
 *
 * Shows inter-agent messages during task execution in a scrollable
 * glassmorphism panel. Includes tool call expansion, filter buttons,
 * and auto-scroll to the latest message.
 */

import { useState, useEffect, useRef } from 'react'
import {
    MessageSquare,
    Bot,
    Cog,
    AlertCircle,
    CheckCircle2,
    XCircle,
    Wrench,
    Filter,
    X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TeamMessage, Agent } from '@/types'

// Color palette for distinguishing agents
const AGENT_COLORS = [
    { dot: 'bg-blue-400', text: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
    { dot: 'bg-purple-400', text: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
    { dot: 'bg-green-400', text: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20' },
    { dot: 'bg-amber-400', text: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
    { dot: 'bg-pink-400', text: 'text-pink-400', bg: 'bg-pink-500/10', border: 'border-pink-500/20' },
    { dot: 'bg-cyan-400', text: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20' },
]

const MESSAGE_ICON: Record<string, typeof Bot> = {
    delegation: Cog,
    result: CheckCircle2,
    system: AlertCircle,
    worker_result: Bot,
    revision_request: AlertCircle,
    accepted: CheckCircle2,
    discussion: MessageSquare,
}

type FilterType = 'all' | 'delegation' | 'result' | 'system'

interface TranscriptPanelProps {
    messages: TeamMessage[]
    agents: Agent[]
    isLive: boolean
    onClose: () => void
}

export function TranscriptPanel({ messages, agents, isLive, onClose }: TranscriptPanelProps) {
    const [filter, setFilter] = useState<FilterType>('all')
    const scrollRef = useRef<HTMLDivElement>(null)

    // Agent color map
    const colorMap = useRef(new Map<string, (typeof AGENT_COLORS)[number]>())
    let nextColor = colorMap.current.size

    function getAgentColor(agentId: string) {
        if (!colorMap.current.has(agentId)) {
            colorMap.current.set(agentId, AGENT_COLORS[nextColor % AGENT_COLORS.length])
            nextColor++
        }
        return colorMap.current.get(agentId) ?? AGENT_COLORS[0]
    }

    // Auto-scroll on new messages
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
    }, [messages.length])

    // Apply filter
    const filteredMessages = filter === 'all'
        ? messages
        : messages.filter((m) => m.message_type === filter)

    const agentMap = new Map(agents.map((a) => [a.id, a]))

    return (
        <div className="workflow-glass-popup rounded-xl w-72 flex flex-col max-h-[420px] overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/5">
                <div className="flex items-center gap-2">
                    <MessageSquare className="h-3.5 w-3.5 text-brand-primary" />
                    <span className="text-xs font-semibold text-gray-300">Transcript</span>
                    <span className="text-[10px] text-gray-500">
                        {messages.length}
                    </span>
                    {isLive && (
                        <span className="flex items-center gap-1">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-400" />
                            <span className="text-[10px] text-green-400">Live</span>
                        </span>
                    )}
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="rounded p-1 text-gray-600 hover:text-gray-300 hover:bg-white/5 transition-colors"
                >
                    <X className="h-3 w-3" />
                </button>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-1 px-3 py-1.5 border-b border-white/5">
                <Filter className="h-3 w-3 text-gray-600 mr-1" />
                {(['all', 'delegation', 'result', 'system'] as const).map((f) => (
                    <button
                        key={f}
                        type="button"
                        onClick={() => setFilter(f)}
                        className={cn(
                            'rounded-full px-2 py-0.5 text-[9px] font-medium capitalize transition-colors',
                            filter === f
                                ? 'bg-brand-primary/15 text-brand-primary'
                                : 'text-gray-500 hover:text-gray-300 hover:bg-white/5',
                        )}
                    >
                        {f}
                    </button>
                ))}
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
                {filteredMessages.length === 0 ? (
                    <p className="text-center text-[11px] text-gray-600 py-4">
                        {messages.length === 0 ? 'No messages yet…' : 'No messages match this filter.'}
                    </p>
                ) : (
                    filteredMessages.map((msg) => {
                        const sender = msg.sender_agent_id
                            ? agentMap.get(msg.sender_agent_id)
                            : null
                        const senderName = sender?.name ?? 'System'
                        const color = msg.sender_agent_id
                            ? getAgentColor(msg.sender_agent_id)
                            : { dot: 'bg-gray-500', text: 'text-gray-500', bg: 'bg-gray-500/10', border: 'border-gray-500/20' }
                        const Icon = MESSAGE_ICON[msg.message_type] ?? Bot

                        return (
                            <div
                                key={msg.id}
                                className={cn(
                                    'rounded-lg border p-2 text-[11px]',
                                    color.bg,
                                    color.border,
                                )}
                            >
                                <div className="flex items-center gap-1.5 mb-1">
                                    <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', color.dot)} />
                                    <span className={cn('font-medium text-[10px]', color.text)}>
                                        {senderName}
                                    </span>
                                    <Icon className="h-2.5 w-2.5 text-gray-600" />
                                    <span className="ml-auto text-[9px] text-gray-600">
                                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                    </span>
                                </div>
                                <p className="text-gray-400 leading-relaxed line-clamp-4 whitespace-pre-wrap">
                                    {msg.content}
                                </p>
                                {/* Tool calls */}
                                <ToolCallsSection metadata={msg.metadata as Record<string, unknown> | null} />
                                {msg.tokens_used > 0 && (
                                    <p className="mt-1 text-[9px] text-gray-600">
                                        {msg.tokens_used.toLocaleString()} tokens
                                    </p>
                                )}
                            </div>
                        )
                    })
                )}
            </div>
        </div>
    )
}

// ─── Tool Calls Section ──────────────────────────────────────────────────────

function ToolCallsSection({ metadata }: { metadata: Record<string, unknown> | null }) {
    const toolCalls = Array.isArray(metadata?.tool_calls)
        ? (metadata.tool_calls as { tool: string; success: boolean; duration_ms: number }[])
        : []

    if (toolCalls.length === 0) return null

    return (
        <div className="mt-1.5 border-t border-white/5 pt-1.5">
            <p className="flex items-center gap-1 text-[9px] font-medium uppercase tracking-wider text-gray-600 mb-1">
                <Wrench className="h-2.5 w-2.5" />
                Tools ({toolCalls.length})
            </p>
            <div className="space-y-0.5">
                {toolCalls.map((tc, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-[10px]">
                        {tc.success
                            ? <CheckCircle2 className="h-2.5 w-2.5 text-green-400 shrink-0" />
                            : <XCircle className="h-2.5 w-2.5 text-red-400 shrink-0" />
                        }
                        <span className="font-mono text-gray-400 truncate">{tc.tool}</span>
                        <span className="ml-auto text-[9px] text-gray-600">{tc.duration_ms}ms</span>
                    </div>
                ))}
            </div>
        </div>
    )
}
