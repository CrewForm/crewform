// SPDX-License-Identifier: AGPL-3.0-or-later
import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({single: vi.fn()}))
vi.mock('@/hooks/useEELicense', () => ({useEELicense: () => ({hasFeature: () => false, isLoading: false, isEnterprise: false})}))
vi.mock('@/lib/supabase', () => ({supabase: {from: () => ({select: () => ({eq: () => ({single: mocks.single})})})}}))
import { useEEFeature } from './featureFlags'
function useConfiguredFeature(feature: string) { return useEEFeature('workspace', feature) }
import { checkQuota } from '@/db/billing'
afterEach(() => vi.unstubAllEnvs())
describe('community adoption entitlements', () => {
    it('permits orchestration and sharing without a paid license while preserving paid gates', () => {
        vi.stubEnv('VITE_CREWFORM_EDITION', 'ce')
        for (const feature of ['orchestrator_mode', 'marketplace_publish', 'a2a_publish', 'chat_widget']) {
            const { result, unmount } = renderHook(useConfiguredFeature, { initialProps: feature })
            expect(result.current.enabled).toBe(true)
            unmount()
        }
        const { result } = renderHook(useConfiguredFeature, { initialProps: 'audit_logs' })
        expect(result.current.enabled).toBe(false)
    })
    it('removes hosted resource limits from readable CE workspaces', async () => {
        vi.stubEnv('VITE_CREWFORM_EDITION', 'ce')
        mocks.single.mockResolvedValue({data: {plan: 'free', is_beta: false, trial_expires_at: null}, error: null})
        expect(await checkQuota('workspace', 'agents')).toMatchObject({allowed: true, limit: -1})
        expect(await checkQuota('workspace', 'csv_export')).toMatchObject({allowed: false})
    })
    it('does not bypass workspace authorization when CE quota limits are removed', async () => {
        vi.stubEnv('VITE_CREWFORM_EDITION', 'ce')
        mocks.single.mockResolvedValue({data: null, error: {message: 'access denied'}})
        expect(await checkQuota('another-workspace', 'agents')).toMatchObject({allowed: false})
    })
})
