// SPDX-License-Identifier: MIT
import {renderHook} from '@testing-library/react'
import {describe,it,expect,vi} from 'vitest'
// Feature access must not fetch or require subscription/activation rows.
vi.mock('@tanstack/react-query',()=>({useQuery:()=>{throw new Error('Software access must not query licences')}}))
import {useEELicense} from './useEELicense'
describe('software features without activation',()=>{
    it('includes former Enterprise capabilities without a workspace licence',()=>{
        const {result}=renderHook(()=>useEELicense(undefined))
        for(const feature of ['audit_logs','rbac','collaboration_mode','team_memory','swarm','custom_tools'])
            expect(result.current.hasFeature(feature)).toBe(true)
        expect(result.current.hasFeature('saml_sso')).toBe(false)
        expect(result.current.hasFeature('made_up_feature')).toBe(false)
    })
})
