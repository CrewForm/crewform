// SPDX-License-Identifier: AGPL-3.0-or-later
// Stage a complete Supabase CLI project without touching linked project state.
import { mkdir, readdir, readFile, writeFile, cp, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const destination = resolve(process.argv[2] ?? resolve(root, '.crewform-local'));
if (destination === root || destination.startsWith(resolve(root, 'supabase'))) throw new Error('Use a separate local backend directory.');
const staged = resolve(destination, 'supabase');
// Only this generated directory is replaced; local database volumes are preserved.
await rm(resolve(staged, 'migrations'), {recursive: true, force: true});
await mkdir(resolve(staged, 'migrations'), {recursive: true});
await cp(resolve(root, 'docker/supabase-local.toml'), resolve(staged, 'config.toml'));
await cp(resolve(root, 'supabase/functions'), resolve(staged, 'functions'), {recursive: true});
// Historical marketplace seeding assumes an auth owner already exists. Provide
// a non-login local system identity, never a seeded password or real account.
await writeFile(resolve(staged, 'migrations', '00000000000000_local_system_owner.sql'), `
INSERT INTO auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, banned_until)
VALUES ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'marketplace@crewform.invalid', '{}', '{}', now(), now(), 'infinity')
ON CONFLICT (id) DO NOTHING;
`);
const filenames = (await readdir(resolve(root, 'supabase/migrations'))).filter(name => /^\d+_.*\.sql$/.test(name)).sort((a, b) => {
    const key = value => value.startsWith('00201_') ? '002_zz' : value;
    return key(a).localeCompare(key(b));
});
const occurrences = new Map();
for (const filename of filenames) {
    const [version, ...name] = filename.split('_');
    const legacyRpc = version === '00201';
    const normalized = legacyRpc ? '002' : version;
    const occurrence = legacyRpc ? 1 : occurrences.get(normalized) ?? 0;
    occurrences.set(normalized, occurrence + 1);
    const uniqueVersion = `${normalized.padStart(12, '0')}${String(occurrence).padStart(2, '0')}`;
    await writeFile(resolve(staged, 'migrations', `${uniqueVersion}_${name.join('_')}`), await readFile(resolve(root, 'supabase/migrations', filename)));
}
console.log(`Staged ${filenames.length} migrations and Edge Functions in ${destination}.`);
console.log(`Start with: supabase start --workdir ${destination}`);

await writeFile(resolve(staged, 'migrations', '99999999999999_local_deployment_policy.sql'), 'UPDATE public.deployment_policy SET hosted=false;');
