// SPDX-License-Identifier: AGPL-3.0-or-later
import {readFile,writeFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const source=await readFile(new URL('shared/urlSafety.ts',root),'utf8');
for(const file of ['task-runner/src/urlSafety.ts','cli/src/urlSafety.ts']) {
 const path=new URL(file,root);
 if(process.argv.includes('--check')) {if(await readFile(path,'utf8')!==source) throw new Error(`Stale security runtime: ${file}`);}
 else await writeFile(path,source);
}
