// SPDX-License-Identifier: MIT
import {readFile,writeFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
for(const [name,files] of [
 ['handoffContract.ts',['task-runner/src/handoffContract.ts','cli/src/handoffContract.ts','src/lib/handoffContract.ts']],
 ['cron-cases.json',['task-runner/src/cron-cases.json','supabase/functions/_shared/cron-cases.json']],
 ['scheduleContext.ts',['task-runner/src/scheduleContext.ts','supabase/functions/_shared/scheduleContext.ts']],
 ['cron.ts',['task-runner/src/cron.ts','supabase/functions/_shared/cron.ts','src/lib/cron.ts']],
]) {
 const source=await readFile(new URL(`shared/${name}`,root),'utf8');
 for(const file of files) {
  const path=new URL(file,root);
  if(process.argv.includes('--check')) {if(await readFile(path,'utf8')!==source) throw new Error(`Stale workflow runtime: ${file}`);}
  else await writeFile(path,source);
 }
}
