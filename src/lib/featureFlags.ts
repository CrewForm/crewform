// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm
import { PLAN_CATALOGUE } from './planCatalogue'
import type { ReactNode } from 'react'
export const COMMUNITY_FEATURES = new Set<string>(PLAN_CATALOGUE.communityFeatures)
/** Compatibility label; hosting plans never unlock software features. */
export function getMinPlanLabel(feature: string): string { return COMMUNITY_FEATURES.has(feature) ? 'Free' : 'Unavailable' }
/** Unknown/unimplemented capabilities stay unavailable. */
export function useEEFeature(_workspaceId: string | undefined, feature: string) {
    return { enabled: COMMUNITY_FEATURES.has(feature), isLoading: false, isEnterprise: false }
}
export interface EEGateProps {
    workspaceId: string | undefined
    feature: string
    children: ReactNode
    fallback?: ReactNode
}
