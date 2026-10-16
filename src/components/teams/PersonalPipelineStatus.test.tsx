// SPDX-License-Identifier: MIT
import {afterEach,expect,it,vi} from 'vitest'
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'
const {load}=vi.hoisted(()=>({load:vi.fn().mockResolvedValue('partial native evidence')}))
vi.mock('@/db/pipelineCheckpoints',()=>({fetchPersonalPipelineOutput:load}))
import {PersonalPipelineStatus} from './PersonalPipelineStatus'
import type {PersonalPipelineJob} from '@/db/pipelineCheckpoints'
afterEach(()=>{cleanup();vi.clearAllMocks()})
const job:PersonalPipelineJob={id:'job',step_idx:0,agent_id:'agent',device_id:'device',status:'queued',has_result:false,error:null}
function show(jobs:PersonalPipelineJob[]) {
    const client=new QueryClient({defaultOptions:{queries:{retry:false}}})
    return render(<QueryClientProvider client={client}><PersonalPipelineStatus jobs={jobs} agentNames={{agent:'Reviewer'}} /></QueryClientProvider>)
}
it('explains offline waiting without promising an API fallback',()=>{
    show([job])
    expect(screen.getByText(/Waiting for approved device/)).toBeInTheDocument()
    expect(screen.getByText(/no API fallback/)).toBeInTheDocument()
    expect(load).not.toHaveBeenCalled()
})
it('retains uncertainty and loads partial output only after explicit inspection',async()=>{
    show([{...job,status:'uncertain',has_result:true,error:'Lease expired'}])
    expect(screen.getByText(/will not be replayed/)).toBeInTheDocument()
    expect(load).not.toHaveBeenCalled()
    const details=screen.getByText(/Inspect device output/).closest('details')
    if(!details) throw new Error('Missing output disclosure')
    details.open=true;fireEvent(details,new Event('toggle'))
    await waitFor(()=>expect(screen.getByText('partial native evidence')).toBeInTheDocument())
    expect(load).toHaveBeenCalledWith('job')
})
