// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 CrewForm

/**
 * Text similarity utilities for marketplace duplicate detection.
 */

/** Standard Levenshtein edit distance between two strings */
export function levenshteinDistance(a: string, b: string): number {
    const la = a.length
    const lb = b.length
    const dp: number[][] = Array.from({ length: la + 1 }, () => Array(lb + 1).fill(0) as number[])

    for (let i = 0; i <= la; i++) dp[i][0] = i
    for (let j = 0; j <= lb; j++) dp[0][j] = j

    for (let i = 1; i <= la; i++) {
        for (let j = 1; j <= lb; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1
            dp[i][j] = Math.min(
                dp[i - 1][j] + 1,       // deletion
                dp[i][j - 1] + 1,       // insertion
                dp[i - 1][j - 1] + cost, // substitution
            )
        }
    }

    return dp[la][lb]
}

/** Returns a 0–1 similarity score (1 = identical, 0 = completely different) */
export function normalizedSimilarity(a: string, b: string): number {
    const maxLen = Math.max(a.length, b.length)
    if (maxLen === 0) return 1
    return 1 - levenshteinDistance(a.toLowerCase(), b.toLowerCase()) / maxLen
}

/** Compute Jaccard similarity of two string arrays (0–1) */
export function tagOverlap(a: string[], b: string[]): number {
    if (a.length === 0 && b.length === 0) return 0
    const setA = new Set(a.map(t => t.toLowerCase()))
    const setB = new Set(b.map(t => t.toLowerCase()))
    let intersection = 0
    for (const t of setA) {
        if (setB.has(t)) intersection++
    }
    const union = new Set([...setA, ...setB]).size
    return union === 0 ? 0 : intersection / union
}

export interface DuplicateMatch {
    id: string
    name: string
    nameSimilarity: number
    tagSimilarity: number
    combinedScore: number
}

/**
 * Find potential duplicate agents among the published set.
 * @returns Matches with combined score ≥ threshold, sorted descending.
 */
export function findDuplicateAgents(
    candidateName: string,
    candidateTags: string[],
    publishedAgents: Array<{ id: string; name: string; marketplace_tags?: string[]; tags?: string[] }>,
    excludeAgentId?: string,
    threshold = 0.4,
): DuplicateMatch[] {
    const matches: DuplicateMatch[] = []

    for (const agent of publishedAgents) {
        if (agent.id === excludeAgentId) continue

        const nameSim = normalizedSimilarity(candidateName, agent.name)
        const agentTags = agent.marketplace_tags ?? agent.tags ?? []
        const tagSim = tagOverlap(candidateTags, agentTags)

        // Weighted: 60% name, 40% tags
        const combined = nameSim * 0.6 + tagSim * 0.4

        if (combined >= threshold) {
            matches.push({
                id: agent.id,
                name: agent.name,
                nameSimilarity: nameSim,
                tagSimilarity: tagSim,
                combinedScore: combined,
            })
        }
    }

    return matches.sort((a, b) => b.combinedScore - a.combinedScore)
}
