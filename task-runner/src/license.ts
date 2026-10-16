// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm
import { PLAN_CATALOGUE } from './planCatalogue'
const softwareFeatures = new Set<string>(PLAN_CATALOGUE.communityFeatures)
/** Legacy API name. Availability never grants workspace permissions or bypasses
 * hosted reservations, native consent, execution fencing or safety limits. */
export function isFeatureEnabled(_workspaceId: string, feature: string): Promise<boolean> {
    return Promise.resolve(softwareFeatures.has(feature))
}
