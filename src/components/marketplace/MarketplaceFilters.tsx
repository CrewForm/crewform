// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

import { Search, SlidersHorizontal } from 'lucide-react'
import type { MarketplaceSortOption } from '@/db/marketplace'

interface MarketplaceFiltersProps {
    search: string
    onSearchChange: (search: string) => void
    selectedTags: string[]
    onTagToggle: (tag: string) => void
    availableTags: string[]
    sort: MarketplaceSortOption
    onSortChange: (sort: MarketplaceSortOption) => void
    category: string | null
    onCategoryChange: (category: string | null) => void
}

const sortLabels: Record<MarketplaceSortOption, string> = {
    installs: 'Most Installed',
    rating: 'Top Rated',
    newest: 'Newest',
}

const CATEGORY_GROUPS = [
    { label: 'Customer Support', tag: 'customer-support' },
    { label: 'Content Creation', tag: 'content-creation' },
    { label: 'Data Analysis', tag: 'data-analysis' },
    { label: 'Code Assistant', tag: 'code-assistant' },
    { label: 'Research', tag: 'research' },
    { label: 'Sales & Marketing', tag: 'sales-marketing' },
    { label: 'DevOps', tag: 'devops' },
    { label: 'Education', tag: 'education' },
] as const

export function MarketplaceFilters({
    search,
    onSearchChange,
    selectedTags,
    onTagToggle,
    availableTags,
    sort,
    onSortChange,
    category,
    onCategoryChange,
}: MarketplaceFiltersProps) {
    return (
        <div className="space-y-4">
            {/* Search + Sort row */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                {/* Search */}
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => onSearchChange(e.target.value)}
                        placeholder="Search agents..."
                        className="w-full rounded-lg border border-border bg-surface-card py-2.5 pl-10 pr-4 text-sm text-gray-100 placeholder-gray-500 outline-none transition-colors focus:border-brand-primary/50 focus:ring-1 focus:ring-brand-primary/20"
                    />
                </div>

                {/* Sort */}
                <div className="flex items-center gap-2">
                    <SlidersHorizontal className="h-4 w-4 text-gray-500" />
                    <select
                        value={sort}
                        onChange={(e) => onSortChange(e.target.value as MarketplaceSortOption)}
                        className="rounded-lg border border-border bg-surface-card px-3 py-2.5 text-sm text-gray-100 outline-none transition-colors focus:border-brand-primary/50"
                    >
                        {(Object.entries(sortLabels) as Array<[MarketplaceSortOption, string]>).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Category groups */}
            <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-500">Categories</p>
                <div className="flex flex-wrap gap-2">
                    {CATEGORY_GROUPS.map(({ label, tag }) => {
                        const isActive = category === tag
                        return (
                            <button
                                key={tag}
                                type="button"
                                onClick={() => onCategoryChange(isActive ? null : tag)}
                                className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${isActive
                                    ? 'bg-brand-primary text-black shadow-sm'
                                    : 'bg-surface-overlay text-gray-400 hover:bg-surface-overlay/80 hover:text-gray-300'
                                    }`}
                            >
                                {label}
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* Tag pills */}
            {availableTags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {availableTags.map((tag) => {
                        const isActive = selectedTags.includes(tag)
                        return (
                            <button
                                key={tag}
                                type="button"
                                onClick={() => onTagToggle(tag)}
                                className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${isActive
                                    ? 'bg-brand-primary text-black shadow-sm'
                                    : 'bg-surface-overlay text-gray-400 hover:bg-surface-overlay/80 hover:text-gray-300'
                                    }`}
                            >
                                {tag}
                            </button>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
