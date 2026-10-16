// SPDX-License-Identifier: MIT
import {afterEach, expect, it, vi} from 'vitest'
import {cleanup, fireEvent, render, screen} from '@testing-library/react'
import {PipelineRecoveryPanel} from './PipelineRecoveryPanel'
import type {PipelineCheckpoint} from '@/db/pipelineCheckpoints'

afterEach(cleanup)
const checkpoint = {revision: 4, next_step: 1, in_flight: null,
    approval: {id: 'approve', step: 1, expiresAt: '2099-01-01T00:00:00Z'}, decisions: [],
    configuration: {team: {config: {steps: [{step_name: 'Review'}, {step_name: 'Critic'}]}}},
    results: [{output: 'Committed evidence'}]} as unknown as PipelineCheckpoint

it('requires explicit review before continuation and exposes saved evidence', () => {
    const action = vi.fn()
    render(<PipelineRecoveryPanel checkpoint={checkpoint} status="paused" onContinue={action} pending={false} error={null} />)
    expect(screen.getByRole('button', {name: 'Approve and continue'})).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', {name: 'Approve and continue'}))
    expect(action).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Committed evidence')).toBeInTheDocument()
})
it.each(['cancelled', 'completed', 'running'])('does not offer continuation for %s work', status => {
    render(<PipelineRecoveryPanel checkpoint={checkpoint} status={status} onContinue={vi.fn()} pending={false} error={null} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
})
it('blocks uncertain outcomes and expired approvals with actionable explanations', () => {
    const view = render(<PipelineRecoveryPanel checkpoint={{...checkpoint, in_flight: 1}} status="failed" onContinue={vi.fn()} pending={false} error={null} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText(/uncertain outcome/)).toBeInTheDocument()
    view.rerender(<PipelineRecoveryPanel checkpoint={{...checkpoint, approval: {id: 'approve', step: 1, expiresAt: '2000-01-01T00:00:00Z'}}} status="paused" onContinue={vi.fn()} pending={false} error="Decision is stale" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText(/approval expired/)).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Decision is stale')
})
