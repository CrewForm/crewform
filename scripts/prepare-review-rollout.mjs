// SPDX-License-Identifier: AGPL-3.0-or-later
// Prepares a reviewable SQL bundle; never connects to or changes a database.
import {mkdir,readdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(!process.argv[2]) throw new Error('Supply a separate output directory.');
const target=resolve(process.argv[2]);
if(target===root || target.startsWith(resolve(root,'supabase'))) throw new Error('Use a separate rollout directory.');
const files=(await readdir(resolve(root,'supabase/migrations'))).filter(name=>/^(0(8[7-9]|9[0-9])|10[0-3])_.*\.sql$/.test(name)).sort();
await mkdir(target,{recursive:true});
let sql='-- CrewForm reviewed upgrade only. Establish the 086 schema baseline first.\nBEGIN;\nSET LOCAL lock_timeout=\'10s\';\n';
for(const file of files) sql+=`\n-- ${file}\n${await readFile(resolve(root,'supabase/migrations',file),'utf8')}\n`;
sql+='COMMIT;\n';
await writeFile(resolve(target,'review-upgrade.sql'),sql,{flag:'wx',mode:0o600});
await writeFile(resolve(target,'manifest.json'),JSON.stringify({baseline:'086 schema; history must be reconciled independently',migrations:files},null,2)+'\n',{flag:'wx',mode:0o600});
console.log(`Prepared ${files.length} migrations in ${target}; no database changes made.`);
