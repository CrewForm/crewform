// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import {
    ResponsiveContainer, AreaChart, Area, BarChart, Bar,
    XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import {
    Loader2, Download, Star, Package, MessageSquare, TrendingUp, AlertCircle,
} from 'lucide-react'
import { useWorkspace } from '@/hooks/useWorkspace'
import { useCreatorAnalytics } from '@/hooks/useMarketplace'
import { cn } from '@/lib/utils'



/**
 * Creator analytics dashboard — comprehensive usage metrics for published agents.
 * Shows install trends, per-agent breakdown, rating distribution, and recent reviews.
 */
export function CreatorDashboard() {
    const { workspaceId } = useWorkspace()
    const { data: analytics, isLoading } = useCreatorAnalytics(workspaceId)

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
            </div>
        )
    }

    if (!analytics || analytics.publishedCount === 0) {
        return (
            <div className="rounded-xl border border-border bg-surface-card p-8 text-center">
                <AlertCircle className="mx-auto mb-2 h-8 w-8 text-gray-600" />
                <p className="text-sm text-gray-400">No published agents yet.</p>
                <p className="text-xs text-gray-600">Publish an agent from the Agents page to see analytics here.</p>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* ─── Summary Cards ──────────────────────────────────────────── */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    icon={Package}
                    label="Published"
                    value={String(analytics.publishedCount)}
                    color="text-brand-primary bg-brand-primary/10"
                />
                <StatCard
                    icon={Download}
                    label="Total Installs"
                    value={analytics.totalInstalls.toLocaleString()}
                    color="text-cyan-400 bg-cyan-500/10"
                />
                <StatCard
                    icon={Star}
                    label="Avg. Rating"
                    value={analytics.avgRating > 0 ? analytics.avgRating.toFixed(1) : '—'}
                    color="text-amber-400 bg-amber-500/10"
                />
                <StatCard
                    icon={MessageSquare}
                    label="Total Reviews"
                    value={String(analytics.totalReviews)}
                    color="text-violet-400 bg-violet-500/10"
                />
            </div>

            {/* ─── Charts Row ─────────────────────────────────────────────── */}
            <div className="grid gap-4 lg:grid-cols-3">
                {/* Install Trend (wider) */}
                <div className="lg:col-span-2 rounded-xl border border-border bg-surface-card p-5">
                    <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-200">
                        <TrendingUp className="h-4 w-4 text-gray-500" />
                        Install Trend (30 days)
                    </h3>
                    {analytics.installTrend.length > 0 ? (
                        <div className="h-52">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={analytics.installTrend} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="installGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="cumulInstallGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                                    <XAxis
                                        dataKey="date"
                                        tick={{ fontSize: 10, fill: '#6b7280' }}
                                        tickFormatter={(d: string) => d.slice(5)}
                                        minTickGap={30}
                                    />
                                    <YAxis
                                        yAxisId="daily"
                                        tick={{ fontSize: 10, fill: '#6b7280' }}
                                        width={30}
                                        allowDecimals={false}
                                    />
                                    <YAxis
                                        yAxisId="cumul"
                                        orientation="right"
                                        tick={{ fontSize: 10, fill: '#6b7280' }}
                                        width={30}
                                        allowDecimals={false}
                                    />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: '#18181b',
                                            border: '1px solid #27272a',
                                            borderRadius: 8,
                                            fontSize: 12,
                                        }}
                                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                        formatter={(value: any, name?: string) => [
                                            Number(value),
                                            name === 'installs' ? 'Daily' : 'Cumulative',
                                        ]}
                                        labelFormatter={(label) => String(label)}
                                    />
                                    <Area
                                        yAxisId="daily"
                                        type="monotone"
                                        dataKey="installs"
                                        stroke="#06b6d4"
                                        fill="url(#installGrad)"
                                        strokeWidth={2}
                                    />
                                    <Area
                                        yAxisId="cumul"
                                        type="monotone"
                                        dataKey="cumulative"
                                        stroke="#8b5cf6"
                                        fill="url(#cumulInstallGrad)"
                                        strokeWidth={2}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="flex h-52 items-center justify-center text-sm text-gray-500">
                            No install data in the last 30 days
                        </div>
                    )}
                </div>

                {/* Rating Distribution */}
                <div className="rounded-xl border border-border bg-surface-card p-5">
                    <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-200">
                        <Star className="h-4 w-4 text-gray-500" />
                        Rating Distribution
                    </h3>
                    {analytics.totalReviews > 0 ? (
                        <div className="h-52">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={analytics.ratingDistribution} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                                    <XAxis
                                        dataKey="rating"
                                        tick={{ fontSize: 11, fill: '#6b7280' }}
                                        tickFormatter={(v: number) => `${v}★`}
                                    />
                                    <YAxis
                                        tick={{ fontSize: 10, fill: '#6b7280' }}
                                        width={25}
                                        allowDecimals={false}
                                    />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: '#18181b',
                                            border: '1px solid #27272a',
                                            borderRadius: 8,
                                            fontSize: 12,
                                        }}
                                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                        formatter={(value: any) => [Number(value), 'Reviews']}
                                        labelFormatter={(label) => `${String(label)}★`}
                                    />
                                    <Bar dataKey="count" radius={[4, 4, 0, 0]} fill="#22c55e" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="flex h-52 items-center justify-center text-sm text-gray-500">
                            No reviews yet
                        </div>
                    )}
                </div>
            </div>

            {/* ─── Per-Agent Breakdown ─────────────────────────────────────── */}
            <div className="rounded-xl border border-border bg-surface-card">
                <div className="border-b border-border px-5 py-3">
                    <h3 className="text-sm font-semibold text-gray-200">Agent Performance</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                                <th className="px-5 py-3">Agent</th>
                                <th className="px-5 py-3 text-right">Installs</th>
                                <th className="px-5 py-3 text-right">Rating</th>
                                <th className="px-5 py-3 text-right">Reviews</th>
                                <th className="px-5 py-3 text-right">Published</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                            {analytics.agents.map((agent) => (
                                <tr key={agent.id} className="hover:bg-surface-raised/50 transition-colors">
                                    <td className="px-5 py-3 font-medium text-gray-200">{agent.name}</td>
                                    <td className="px-5 py-3 text-right text-gray-300">
                                        <span className="inline-flex items-center gap-1">
                                            <Download className="h-3 w-3 text-cyan-400" />
                                            {agent.install_count.toLocaleString()}
                                        </span>
                                    </td>
                                    <td className="px-5 py-3 text-right text-gray-300">
                                        <span className="inline-flex items-center gap-1">
                                            <Star className="h-3 w-3 text-amber-400" />
                                            {agent.rating_avg > 0 ? agent.rating_avg.toFixed(1) : '—'}
                                        </span>
                                    </td>
                                    <td className="px-5 py-3 text-right text-gray-400">
                                        {agent.review_count}
                                    </td>
                                    <td className="px-5 py-3 text-right text-xs text-gray-500">
                                        {new Date(agent.created_at).toLocaleDateString()}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ─── Recent Reviews ──────────────────────────────────────────── */}
            {analytics.recentReviews.length > 0 && (
                <div className="rounded-xl border border-border bg-surface-card">
                    <div className="border-b border-border px-5 py-3">
                        <h3 className="text-sm font-semibold text-gray-200">Recent Reviews</h3>
                    </div>
                    <div className="divide-y divide-border/50">
                        {analytics.recentReviews.map((review) => (
                            <div key={review.id} className="px-5 py-3">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-sm font-medium text-gray-300">{review.agent_name}</span>
                                    <div className="flex items-center gap-1.5">
                                        <div className="flex">
                                            {Array.from({ length: 5 }).map((_, i) => (
                                                <Star
                                                    key={i}
                                                    className={cn(
                                                        'h-3 w-3',
                                                        i < review.rating
                                                            ? 'fill-amber-400 text-amber-400'
                                                            : 'text-gray-700',
                                                    )}
                                                />
                                            ))}
                                        </div>
                                        <span className="text-xs text-gray-500">
                                            {new Date(review.created_at).toLocaleDateString()}
                                        </span>
                                    </div>
                                </div>
                                {review.review_text && (
                                    <p className="mt-1 text-xs text-gray-400 line-clamp-2">{review.review_text}</p>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

// ─── Stat Card Component ────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, color }: {
    icon: typeof Package
    label: string
    value: string
    color: string
}) {
    return (
        <div className="rounded-xl border border-border bg-surface-card p-5">
            <div className="mb-2 flex items-center gap-2">
                <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg', color)}>
                    <Icon className="h-4 w-4" />
                </div>
                <span className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</span>
            </div>
            <p className="text-2xl font-bold text-gray-100">{value}</p>
        </div>
    )
}
