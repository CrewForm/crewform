// SPDX-License-Identifier: MIT
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
const { state } = vi.hoisted(() => ({
  state: {
    isDemoSeeded: true,
    isDemoDismissed: false,
    demoTeamId: 'team',
    demoManifest: null as null | {
      seed_id: string
      team: { id: string; name: string }
      agents: { id: string; name: string }[]
    },
    isLoadingManifest: false,
    manifestError: null as Error | null,
    seedDemo: vi.fn(),
    removeDemo: vi.fn(),
    isSeeding: false,
    isRemoving: false,
  },
}))
vi.mock('@/hooks/useDemoWorkspace', () => ({ useDemoWorkspace: () => state }))
vi.mock('@/hooks/useWorkspace', () => ({ useWorkspace: () => ({ workspaceId: 'workspace' }) }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'user' } }) }))
vi.mock('@/hooks/useApiKeys', () => ({ useApiKeys: () => ({ keys: [], isLoading: false }) }))
vi.mock('@/hooks/useCreateTeamRun', () => ({
  useCreateTeamRun: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))
import { DemoBanner } from './DemoBanner'
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  state.demoManifest = null
  state.manifestError = null
  state.isDemoSeeded = true
})
it('names tracked resources and protects customized data in the removal confirmation', () => {
  state.demoManifest = {
    seed_id: 'seed',
    team: { id: 'team', name: 'Research Brief Pipeline' },
    agents: [{ id: 'agent', name: 'Research Analyst' }],
  }
  render(<DemoBanner />)
  fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
  expect(screen.getByText(/1 tracked agent/)).toBeInTheDocument()
  expect(screen.getByText('Research Analyst')).toBeInTheDocument()
  expect(screen.getByText(/including its run history/)).toBeInTheDocument()
  expect(screen.getByText(/automatic removal will stop/)).toBeInTheDocument()
})
it('offers legacy marker cleanup that keeps all resources', () => {
  render(<DemoBanner />)
  fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
  expect(screen.getByRole('button', { name: 'Clear marker; keep all data' })).toBeEnabled()
  expect(screen.getByText(/keeping all agents and team data/)).toBeInTheDocument()
})
it('blocks cleanup when resource identity could not be loaded', () => {
  state.manifestError = new Error('offline')
  render(<DemoBanner />)
  fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
  expect(screen.getByRole('alert')).toHaveTextContent(/Reload the page/)
  expect(screen.getByRole('button', { name: 'Clear marker; keep all data' })).toBeDisabled()
})
it('advertises the actual three-agent source-grounded demo', () => {
  state.isDemoSeeded = false
  render(<DemoBanner />)
  expect(screen.getByText('3 AI Agents')).toBeInTheDocument()
  expect(screen.queryByText('5 AI Agents')).not.toBeInTheDocument()
})
