// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm
import { spawnSync } from 'node:child_process';
import { nativeEnvironment } from '@crewformhq/agent-runtime';

export const RUNTIME_COMMANDS = {
    'codex:cli': 'codex', 'claude:cli': 'claude',
    'gemini:acp': 'gemini', 'copilot:acp': 'copilot',
    'codex:acp': 'codex-acp', 'claude:acp': 'claude-agent-acp',
} as const;
export function diagnose(version: string, runtime?: string) {
    if (runtime && !(runtime in RUNTIME_COMMANDS)) throw new Error(`Unsupported runtime. Choose ${Object.keys(RUNTIME_COMMANDS).join(', ')}.`);
    const runtimes = Object.entries(RUNTIME_COMMANDS).filter(([name]) => !runtime || runtime === name).map(([name, command]) => {
        const check = spawnSync(command, ['--version'], {encoding: 'utf8', timeout: 3000,
            maxBuffer: 32 * 1024, env: nativeEnvironment(), shell: false});
        return {runtime: name, installed: check.status === 0, authentication: 'not-checked',
            nextAction: check.status === 0 ? `Check login and subscription eligibility in ${command}.` : `Install ${command}, then rerun doctor.`};
    });
    return {schemaVersion: 1, cliVersion: version, node: process.versions.node, platform: process.platform,
        nodeSupported: Number(process.versions.node.split('.')[0]) >= 20,
        offlineDemo: 'crewform demo', runtimes,
        scope: 'Version probes only. Login, plan eligibility, Cloud connectivity and model execution are not checked.'};
}
