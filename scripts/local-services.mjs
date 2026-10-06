// SPDX-License-Identifier: AGPL-3.0-or-later
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const directory = resolve(root, '.crewform-local');
const envFile = resolve(directory, 'app.env');
const parse = (text) => Object.fromEntries(text.split('\n').filter(line => /^[A-Z_]+=/.test(line)).map(line => {
    const index = line.indexOf('=');
    let value = line.slice(index + 1);
    if (value.startsWith('"')) value = JSON.parse(value);
    return [line.slice(0, index), value];
}));
const action = process.argv[2];
if (action === 'env') {
    const status = parse(execFileSync('supabase', ['status', '--workdir', directory, '-o', 'env'], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit']}));
    const previous = existsSync(envFile) ? parse(readFileSync(envFile, 'utf8')) : {};
    if (!status.API_URL || !status.ANON_KEY || !status.SERVICE_ROLE_KEY) throw new Error('Start the local Supabase backend first.');
    const values = {
        ...previous,
        VITE_SUPABASE_URL: status.API_URL,
        SUPABASE_URL: status.API_URL,
        SUPABASE_INTERNAL_URL: status.API_URL.replace(/127\.0\.0\.1|localhost/, 'host.docker.internal'),
        VITE_SUPABASE_ANON_KEY: status.ANON_KEY,
        SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
        VITE_APP_URL: 'http://localhost:3000', VITE_TASK_RUNNER_URL: 'http://localhost:3001',
        VITE_CREWFORM_EDITION: 'ce', CREWFORM_EDITION: 'ce',
        API_KEY_ENCRYPTION_KEY: previous.API_KEY_ENCRYPTION_KEY || randomBytes(32).toString('hex'),
        WEBHOOK_SECRET: previous.WEBHOOK_SECRET || randomBytes(32).toString('hex'),
        TRIGGER_SCHEDULER_ENABLED: 'true', CREWFORM_EXTERNAL_AGENTS_ENABLED: previous.CREWFORM_EXTERNAL_AGENTS_ENABLED || 'false',
    };
    const serialize = (values) => Object.entries(values).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n') + '\n';
    writeFileSync(envFile, serialize(values), {mode: 0o600});
    writeFileSync(resolve(directory, 'edge.env'), serialize({API_KEY_ENCRYPTION_KEY: values.API_KEY_ENCRYPTION_KEY, WEBHOOK_SECRET: values.WEBHOOK_SECRET, CREWFORM_EDITION: 'ce'}), {mode: 0o600});
    console.log('Local configuration saved to .crewform-local/app.env and edge.env. Secrets were not printed.');
} else {
    if (!['frontend', 'runner', 'functions'].includes(action)) throw new Error('Choose env, frontend, runner or functions.');
    const values = parse(readFileSync(envFile, 'utf8'));
    const env = {...process.env, ...values};
    let command, args;
    if (action === 'frontend') {
        command = 'npm'; args = ['run', 'dev', '--', '--port', '3000'];
        // Only browser-public configuration is passed to the frontend process.
        for (const key of Object.keys(values)) if (!key.startsWith('VITE_')) delete env[key];
    } else if (action === 'runner') {
        command = process.execPath; args = [resolve(root, 'task-runner/dist/index.js')];
    } else {
        command = 'supabase'; args = ['functions', 'serve', '--workdir', directory, '--env-file', resolve(directory, 'edge.env'), '--no-verify-jwt'];
    }
    const child = spawn(command, args, {cwd: root, env, stdio: 'inherit', shell: false});
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
    child.on('error', error => { console.error(error.message); process.exitCode = 1; });
    child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 130 : 1); });
}
