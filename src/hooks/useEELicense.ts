// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm
import { COMMUNITY_FEATURES } from '@/lib/featureFlags'
/** Compatibility hook: implemented software features are free. Workspace roles
 * and hosted resource authorization are enforced separately. */
export function useEELicense(_workspaceId: string | undefined) {
    void _workspaceId
    return { isLoading: false, isEnterprise: false,
        hasFeature: (feature: string) => COMMUNITY_FEATURES.has(feature) }
}
