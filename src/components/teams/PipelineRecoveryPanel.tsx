// SPDX-License-Identifier: MIT
import {useState} from 'react'
import type {PipelineCheckpoint} from '@/db/pipelineCheckpoints'

export function PipelineRecoveryPanel({checkpoint, status, onContinue, pending, error}: {
    checkpoint: PipelineCheckpoint; status: string; onContinue: () => void; pending: boolean; error: string | null
}) {
    const [reviewed, setReviewed] = useState(false)
    const uncertain = checkpoint.in_flight !== null && status === 'failed'
    const expired = checkpoint.approval !== null && Date.parse(checkpoint.approval.expiresAt) <= Date.now()
    const finished = checkpoint.next_step >= checkpoint.configuration.team.config.steps.length
    const canContinue = (status === 'paused' || status === 'failed') && checkpoint.in_flight === null && !expired
    return <section aria-label="Saved pipeline progress" className="mb-6 rounded-lg border border-border bg-surface-card p-4">
        <h2 className="text-sm font-medium text-gray-200">Saved pipeline progress</h2>
        <p className="mt-2 text-sm text-gray-400">{checkpoint.next_step} committed step{checkpoint.next_step === 1 ? '' : 's'}. Completed outputs are retained below.</p>
        {uncertain && <p className="mt-2 text-sm text-red-300">Step {(checkpoint.in_flight ?? 0) + 1} has an uncertain outcome. Review possible effects before creating a new run. This step cannot be replayed through continuation.</p>}
        {expired && <p className="mt-2 text-sm text-amber-300">The approval expired. Review the saved outputs and create a new run if you still want to proceed.</p>}
        {checkpoint.results.map((result, index) => <details key={index} className="mt-3 border-t border-border pt-3">
            <summary className="cursor-pointer text-sm text-gray-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-primary">{index + 1}. {checkpoint.configuration.team.config.steps[index]?.step_name ?? 'Step'} — {result ? 'committed' : 'skipped'}</summary>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs text-gray-400">{result?.output ?? 'Skipped according to the configured failure policy.'}</pre>
        </details>)}
        {canContinue && <div className="mt-4 border-t border-border pt-4">
            <p className="text-sm text-gray-300">{finished ? 'All steps are committed. Finalize the saved run without repeating agent calls.' : `Continue at step ${checkpoint.next_step + 1}. Saved outputs will be reused. Remaining model calls may use your provider allowance.`}</p>
            <label className="mt-3 flex items-start gap-2 text-sm text-gray-300">
                <input type="checkbox" checked={reviewed} onChange={event => {setReviewed(event.target.checked)}} className="mt-1 accent-brand-primary" />
                I reviewed the completed outputs and approve continuation.
            </label>
            <button type="button" onClick={onContinue} disabled={!reviewed || pending}
                className="mt-3 rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-black hover:bg-brand-hover disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary">
                {pending ? 'Continuing…' : finished ? 'Finalize saved run' : 'Approve and continue'}
            </button>
        </div>}
        {checkpoint.decisions.length > 0 && <details className="mt-4 border-t border-border pt-3">
            <summary className="cursor-pointer text-sm text-gray-300">Continuation decisions ({checkpoint.decisions.length})</summary>
            <ul className="mt-2 space-y-2 text-xs text-gray-400">{checkpoint.decisions.map(decision => <li key={decision.revision} className="break-words">
                Step {decision.nextStep + 1} approved by {decision.actor} · {new Date(decision.at).toLocaleString()}
            </li>)}</ul>
        </details>}
        {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
    </section>
}
