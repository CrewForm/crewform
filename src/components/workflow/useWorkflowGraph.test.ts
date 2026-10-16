// SPDX-License-Identifier: MIT
import {expect,it} from 'vitest'
import {graphToPipelineConfig} from './useWorkflowGraph'
import type {Agent,PipelineConfig} from '@/types'
it('keeps each step contract when one agent is reused and steps are reordered', () => {
    const config: PipelineConfig = {auto_handoff:false,steps:['Review','Critic'].map((name,index)=>({agent_id:'same-agent',step_name:name,
        instructions:name,expected_output:'JSON',on_failure:'stop',max_retries:0,
        output_contract:{version:1,schema:{type:'integer',enum:[index]}}}))}
    const nodes=[{id:'start',type:'startNode',position:{x:0,y:0},data:{}},
        ...[0,1].map(index=>({id:`agent-${index}`,type:'agentNode',position:{x:0,y:0},data:{agentId:'same-agent',label:'Agent'}}))]
    const edges=[{id:'1',source:'start',target:'agent-1'},{id:'2',source:'agent-1',target:'agent-0'}]
    const result=graphToPipelineConfig(nodes,edges,[{id:'same-agent',name:'Agent'} as Agent],config)
    expect(result.steps.map(step=>step.step_name)).toEqual(['Critic','Review'])
    expect(result.steps.map(step=>step.output_contract?.schema.enum)).toEqual([[1],[0]])
    expect(result.auto_handoff).toBe(false)
})
