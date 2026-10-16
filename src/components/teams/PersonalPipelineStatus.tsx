// SPDX-License-Identifier: MIT
import type {PersonalPipelineJob} from '@/db/pipelineCheckpoints'
import {fetchPersonalPipelineOutput} from '@/db/pipelineCheckpoints'
import {useQuery} from '@tanstack/react-query'
import {useState} from 'react'
const labels = {queued:'Waiting for approved device', running:'Running on approved device', completed:'Device result received',
    failed:'Device job failed',cancelled:'Device job cancelled',uncertain:'Device outcome uncertain'}
export function PersonalPipelineStatus({jobs,agentNames}:{jobs:PersonalPipelineJob[];agentNames:Record<string,string>}) {
    if (!jobs.length) return null
    return <section aria-label="Personal device execution" className="mb-6 rounded-lg border border-border bg-surface-card p-4">
        <h2 className="text-sm font-medium text-gray-200">Personal device execution</h2>
        <ul className="mt-3 divide-y divide-border">
            {jobs.map(job=><li key={job.id} className="py-3 text-sm text-gray-300">
                <p className="break-words">Step {job.step_idx+1} · {agentNames[job.agent_id] ?? 'Approved agent'} · {labels[job.status]}</p>
                {job.status==='queued' && <p className="mt-1 text-sm text-gray-400">Start the selected local worker profile. It can wait up to 15 minutes; no API fallback will run.</p>}
                {job.status==='uncertain' && <p className="mt-1 text-sm text-amber-300">Review possible native effects before creating a new run. This issued lease will not be replayed.</p>}
                {job.error && <p className="mt-1 text-sm text-red-300">{job.error}</p>}
                {job.has_result && <DeviceOutput jobId={job.id} />}
            </li>)}
        </ul>
    </section>
}
function DeviceOutput({jobId}:{jobId:string}) {
    const [open,setOpen] = useState(false)
    const output=useQuery({queryKey:['personal-pipeline-output',jobId],queryFn:()=>fetchPersonalPipelineOutput(jobId),enabled:open,staleTime:5000})
    return <details className="mt-2" onToggle={event=>{setOpen(event.currentTarget.open)}}>
        <summary className="cursor-pointer text-sm text-gray-300">Inspect device output · check saved progress for step validation</summary>
        {output.isFetching && <p role="status" className="mt-2 text-sm text-gray-400">Loading device output…</p>}
        {output.error ? <button type="button" className="mt-2 text-sm text-red-300 underline" onClick={()=>{void output.refetch()}}>Device output could not be loaded. Retry.</button>
            : output.data !== undefined && <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs text-gray-400">{output.data ?? 'No output received.'}</pre>}
    </details>
}
