// SPDX-License-Identifier: MIT
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {executePipeline} from '../dist/pipelineExecutor.js';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
const agent = name => ({name, model: 'fixture', config: {}, tools: []});
test('contract mismatch stops a real pipeline before downstream execution, including retry/skip policies', async () => {
    for (const policy of ['retry', 'skip']) {
        const calls = [];
        await assert.rejects(executePipeline({mode: 'pipeline', agents: [
            {ref_id: 'reviewer', agent: agent('Reviewer')}, {ref_id: 'critic', agent: agent('Critic')},
        ], config: {auto_handoff: true, steps: [
            {agent_ref: 'reviewer', step_name: 'Review', on_failure: policy, max_retries: 5,
                output_contract: {version: 1, schema: {type: 'object', required: ['source'], properties: {source: {type: 'string'}}}}},
            {agent_ref: 'critic', step_name: 'Critic'},
        ]}}, 'supplied patch', {execute: async (agent, options) => {
            calls.push(agent.name);
            assert.match(options.prompt, /Output Contract v1/);
            return {result: '{}', usage: {}, toolCallLogs: []};
        }}), /Handoff/);
        assert.deepEqual(calls, ['Reviewer']);
    }
});
test('unsupported contract versions are rejected before any model call', async () => {
    let called = false;
    await assert.rejects(executePipeline({mode: 'pipeline', agents: [], config: {steps: [{output_contract: {version: 2}}]}}, '', {
        execute: async () => {called = true;},
    }), /version 1/);
    assert.equal(called, false);
});
test('native failure never advances through an automatic skip policy',async()=>{
    const calls=[];
    await assert.rejects(executePipeline({mode:'pipeline',agents:[{ref_id:'native',agent:{...agent('Native'),config:{execution:{kind:'external',agent:'codex',transport:'cli'}}}}],
        config:{auto_handoff:true,steps:[{agent_ref:'native',step_name:'Review',on_failure:'skip'},{agent_ref:'native',step_name:'Next'}]}},'input',{
            execute:async agent=>{calls.push(agent.name);throw new Error('Interrupted native call');},
        }),/not retried or skipped/);
    assert.deepEqual(calls,['Native']);
});
test('partial fan-out cannot hide a failed native branch and invoke a merge',async()=>{
    const calls=[];
    const agents=[{ref_id:'native',agent:{...agent('Native'),config:{execution:{kind:'external',agent:'codex',transport:'cli'}}}},
        {ref_id:'api',agent:agent('API')},{ref_id:'merge',agent:agent('Merge')}];
    await assert.rejects(executePipeline({mode:'pipeline',agents,config:{auto_handoff:true,steps:[{type:'fan_out',parallel_agents:['native','api'],merge_agent_ref:'merge',step_name:'Branches',fan_out_failure:'continue_on_partial'}]}},'input',{
        execute:async agent=>{calls.push(agent.name);if(agent.name==='Native')throw new Error('Interrupted native branch');return {result:'API result',usage:{},toolCallLogs:[]};},
    }),/native fan-out branch failed/);
    assert.deepEqual(calls.sort(),['API','Native']);
});
test('Codex CLI to Claude ACP protocol fixtures preserve validated evidence and unknown usage', () => {
    const directory = mkdtempSync(resolve(tmpdir(),'crewform-handoff-'));
    try {
        const file = resolve(directory,'team.json');
        const peer = resolve('../agent-runtime/test/fake-agent.cjs');
        const contract = properties => ({version:1,schema:{type:'object',additionalProperties:false,required:Object.keys(properties),properties}});
        writeFileSync(file,JSON.stringify({name:'Cross-framework fixture',mode:'pipeline',config:{auto_handoff:true,steps:[
            {agent_ref:'reviewer',step_name:'Review',output_contract:contract({version:{type:'integer',enum:[1]},source:{type:'string'},finding:{type:'string'}})},
            {agent_ref:'critic',step_name:'Critic',output_contract:contract({version:{type:'integer',enum:[1]},supported:{type:'boolean'},source:{type:'string'}})},
        ]},agents:[{ref_id:'reviewer',agent:{...agent('Reviewer'),model:'default',system_prompt:'FIXTURE_REVIEWER',config:{execution:{kind:'external',agent:'codex',transport:'cli'}}}},
            {ref_id:'critic',agent:{...agent('Critic'),model:'default',system_prompt:'FIXTURE_CRITIC',config:{execution:{kind:'external',agent:'claude',transport:'acp'}}}}]}));
        const result = JSON.parse(execFileSync(process.execPath,[resolve('dist/cli.js'),'run',file,'Supplied fixture patch P1','--json'],{encoding:'utf8',
            env:{...process.env,CREWFORM_CODEX_CLI_PATH:peer,CREWFORM_CLAUDE_ACP_PATH:peer}}));
        assert.equal(result.steps.length,2);
        assert.deepEqual(JSON.parse(result.result),{version:1,supported:true,source:'P1:3'});
        assert.equal(result.usage.usageKnown,false);
        assert.equal(result.usage.costEstimateUSD,null);
    } finally {rmSync(directory,{recursive:true,force:true});}
});
