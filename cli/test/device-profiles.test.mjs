// SPDX-License-Identifier: MIT
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
const moduleUrl=pathToFileURL(resolve('dist/personalWorker.js')).href;
test('local profiles isolate device credentials without moving native login stores',()=>{
    const directory=mkdtempSync(join(tmpdir(),'crewform-profile-'));
    try {
        for(const [profile,id] of [['default','11111111-1111-4111-8111-111111111111'],['claude','22222222-2222-4222-8222-222222222222']]) {
            const path=profile==='default'?join(directory,'.crewform'):join(directory,'.crewform','profiles',profile);
            mkdirSync(path,{recursive:true,mode:0o700});
            writeFileSync(join(path,'device.json'),JSON.stringify({deviceId:id,workspaceId:'33333333-3333-4333-8333-333333333333',credential:'a'.repeat(43)}),{mode:0o600});
        }
        const code=`const {setDeviceProfile,loadDevice}=await import(${JSON.stringify(moduleUrl)});setDeviceProfile('default');const first=loadDevice().config.deviceId;setDeviceProfile('claude');const second=loadDevice().config.deviceId;console.log(JSON.stringify({first,second,home:process.env.HOME}));`;
        const result=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8',env:{...process.env,HOME:directory}}));
        assert.notEqual(result.first,result.second);assert.equal(result.home,directory);
    } finally {rmSync(directory,{recursive:true,force:true});}
});
test('profile path traversal and symlinked profile parents are rejected',()=>{
    const directory=mkdtempSync(join(tmpdir(),'crewform-profile-'));
    try {
        mkdirSync(join(directory,'.crewform'),{mode:0o700});
        mkdirSync(join(directory,'elsewhere'),{mode:0o700});
        symlinkSync(join(directory,'elsewhere'),join(directory,'.crewform','profiles'));
        const code=`import assert from 'node:assert/strict';const {setDeviceProfile,loadDevice}=await import(${JSON.stringify(moduleUrl)});assert.throws(()=>setDeviceProfile('../escape'),/Device profile/);setDeviceProfile('claude');assert.throws(()=>loadDevice(),/symlink/);`;
        execFileSync(process.execPath,['--input-type=module','-e',code],{env:{...process.env,HOME:directory}});
    } finally {rmSync(directory,{recursive:true,force:true});}
});
