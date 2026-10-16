// SPDX-License-Identifier: MIT
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
const fixture = vi.hoisted(() => ({policy: {data: {hosted: false} as {hosted:boolean} | undefined, isLoading:false, error:null as Error|null, refetch:vi.fn()}}))
vi.mock('@/hooks/useDeploymentPolicy', () => ({useDeploymentPolicy:()=>fixture.policy}))
vi.mock('@/hooks/useWorkspace',()=>({useWorkspace:()=>{throw new Error('Self-hosted UI must not load Cloud billing')}}))
vi.mock('@/hooks/useBilling',()=>({useSubscription:()=>{throw new Error('Unexpected subscription lookup')},useUsage:vi.fn(),useQuotaCheck:vi.fn(),useCreatePortal:vi.fn(),useCreateCheckout:vi.fn()}))
import { BillingSettings } from './BillingSettings'
afterEach(()=>{cleanup();fixture.policy.data={hosted:false};fixture.policy.error=null})
describe('hosted-only billing surface',()=>{
 it('shows free self-hosting without loading subscription or checkout controls',()=>{
  render(<BillingSettings />)
  expect(screen.getByText('Free self-hosting')).toBeInTheDocument()
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
 })
 it('does not offer paid hosting when deployment policy cannot be verified',()=>{
  fixture.policy.data=undefined;fixture.policy.error=new Error('database unavailable')
  render(<BillingSettings />)
  expect(screen.getByRole('alert')).toHaveTextContent('Could not load hosting configuration')
  expect(screen.getByRole('button',{name:'Try again'})).toBeInTheDocument()
  expect(screen.queryByText('Free self-hosting')).not.toBeInTheDocument()
 })
})
