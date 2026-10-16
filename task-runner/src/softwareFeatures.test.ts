// SPDX-License-Identifier: MIT
import {describe,it,expect,vi,afterEach} from 'vitest'
vi.mock('./supabase',()=>{throw new Error('Feature availability must not require a licence database')})
import {isFeatureEnabled} from './license'
afterEach(()=>vi.unstubAllEnvs())
describe('MIT execution capabilities',()=>{
 it.each(['ce','ee',''])('runs collaboration without keys in the legacy %s edition',async edition=>{
  vi.stubEnv('CREWFORM_EDITION',edition)
  vi.stubEnv('CREWFORM_LICENSE_SECRET','irrelevant-legacy-value')
  expect(await isFeatureEnabled('workspace','collaboration_mode')).toBe(true)
  expect(await isFeatureEnabled('workspace','audit_logs')).toBe(true)
  expect(await isFeatureEnabled('workspace','saml_sso')).toBe(false)
 })
})
