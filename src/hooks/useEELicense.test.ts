// SPDX-License-Identifier: AGPL-3.0-or-later
import {renderHook} from '@testing-library/react'
import {describe,it,expect,vi} from 'vitest'
const fixture=vi.hoisted(()=>({plan:'pro'}))
vi.mock('@tanstack/react-query',()=>({useQuery:()=>({data:{plan:fixture.plan,features:[]},isLoading:false})}))
vi.mock('@/db/eeLicense',()=>({fetchEELicense:vi.fn()}))
vi.mock('@/hooks/useWorkspace',()=>({useWorkspace:()=>({trialActive:false,effectivePlan:'free'})}))
import {useEELicense} from './useEELicense'
describe('renamed Custom tier retains its feature boundary',()=>{
    it.each(['pro','team'])('does not grant Custom audit features to %s',plan=>{
        fixture.plan=plan
        const {result}=renderHook(()=>useEELicense('fixture'))
        expect(result.current.hasFeature('audit_logs')).toBe(false)
        expect(result.current.hasFeature('orchestrator_mode')).toBe(true)
    })
    it.each(['enterprise','custom'])('recognises %s as the on-premises feature level',plan=>{
        fixture.plan=plan
        const {result}=renderHook(()=>useEELicense('fixture'))
        expect(result.current.hasFeature('audit_logs')).toBe(true)
    })
})
