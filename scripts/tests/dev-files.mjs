// SPDX-License-Identifier: MIT
import {createServer} from 'vite';
import {mkdir,writeFile,rm} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const name=`dev-access-${randomUUID()}`;
const privateDirectory=resolve(root,'.crewform-local',name);
const privateEnv=resolve(privateDirectory,'app.env');
const privateText=resolve(privateDirectory,'private.txt');
const cliFile=resolve(root,'supabase/.temp',`${name}.json`);
const defaultEnv=resolve(root,`.env.${name}`);
const publicFile=resolve(root,'public',`${name}.txt`);
let server;
try {
    await mkdir(privateDirectory,{recursive:true,mode:0o700});
    await mkdir(dirname(cliFile),{recursive:true,mode:0o700});
    for(const file of [privateEnv,privateText,cliFile,defaultEnv]) await writeFile(file,'PRIVATE_FIXTURE_ONLY=not-a-real-key',{mode:0o600});
    await writeFile(publicFile,'public fixture');
    server=await createServer({root,configFile:resolve(root,'vite.config.ts'),server:{host:'127.0.0.1',port:0,strictPort:false,hmr:false},logLevel:'silent'});
    await server.listen();
    const address=server.httpServer.address();
    if(!address || typeof address==='string') throw new Error('No local test port');
    const origin=`http://127.0.0.1:${address.port}`;
    const requests=[`/.crewform-local/${name}/app.env`,`/.crewform-local/${name}/private.txt`,
        `/.crewform-local/${name}/private.txt?raw`,`/supabase/.temp/${name}.json`,`/.env.${name}`,
        `/@fs${privateEnv}`,`/@fs${privateText}?raw`,`/@fs${defaultEnv}`];
    for(const path of requests) {
        const response=await fetch(origin+path);
        const body=await response.text();
        assert.equal(response.status,403,`Private route was accessible: ${path}`);
        assert.ok(!body.includes('PRIVATE_FIXTURE_ONLY=not-a-real-key'),'Private fixture contents escaped the deny rule');
    }
    const publicResponse=await fetch(`${origin}/${name}.txt`);
    assert.equal(publicResponse.status,200);assert.equal(await publicResponse.text(),'public fixture');
    console.log('Development file boundary passed: private config, CLI state, raw imports and @fs blocked; public assets available.');
} finally {
    await server?.close();
    await Promise.all([rm(privateDirectory,{recursive:true,force:true}),...[cliFile,defaultEnv,publicFile].map(file=>rm(file,{force:true}))]);
}
