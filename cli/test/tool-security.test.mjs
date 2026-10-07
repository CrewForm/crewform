// SPDX-License-Identifier: AGPL-3.0-or-later
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {getAvailableTools,executeWithToolLoop} from '../dist/tools.js';
test('model-proposed interpreter calls never execute in the CLI process',async()=>{
 assert.ok(!getAvailableTools().includes('code_interpreter'));
 let turn=0;
 const result=await executeWithToolLoop(async messages=>({message:++turn===1?{role:'assistant',content:null,tool_calls:[{id:'fixture',function:{name:'code_interpreter',arguments:JSON.stringify({code:'globalThis.crewformSecurityFixture = true; return typeof process;'})}}]}:{role:'assistant',content:messages.at(-1).content},usage:{promptTokens:0,completionTokens:0}}),'system','fixture',['code_interpreter']);
 assert.match(result.result,/disabled/);assert.equal(globalThis.crewformSecurityFixture,undefined);
});
