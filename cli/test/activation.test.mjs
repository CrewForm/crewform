// SPDX-License-Identifier: MIT
// Copyright (C) 2026 CrewForm
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { runOfflineDemo } from '../dist/demo.js';
import { executePipeline } from '../dist/pipelineExecutor.js';

test('offline walkthrough produces a versioned evidence pack without executables or credentials', () => {
    const directory = mkdtempSync(resolve(tmpdir(), 'crewform-offline-'));
    try {
        const file = resolve(directory, 'pack.json');
        const stdout = execFileSync(process.execPath, [resolve('dist/cli.js'), 'demo', '--json', '--output', file], {
            cwd: directory, encoding: 'utf8', env: {PATH: '', HOME: directory},
        });
        const result = JSON.parse(stdout);
        assert.equal(result.simulated, true);
        assert.deepEqual(result.steps.map(step => step.stepName), ['Reviewer', 'Critic', 'Packager']);
        assert.ok(result.steps.every(step => step.status === 'completed' && !step.toolCallLogs.length));
        assert.equal(result.pack.findings[0].source, 'P1:3');
        assert.equal(result.pack.humanReview, 'required');
        assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), result.pack);
        assert.equal(result.usage.costEstimateUSD, 0);
    } finally {rmSync(directory, {recursive: true, force: true});}
});
test('malformed reviewer output stops before critic execution', async () => {
    const calls = [];
    await assert.rejects(runOfflineDemo(async agent => {
        calls.push(agent.name);
        return {result: '{"schemaVersion":2,"findings":[]}', usage: {totalTokens: 0}, toolCallLogs: []};
    }), /Reviewer.*failed/);
    assert.deepEqual(calls, ['Reviewer']);
});
test('local execution cannot silently bypass durable approval settings', async () => {
    let called = false;
    await assert.rejects(executePipeline({mode: 'pipeline', agents: [], config: {auto_handoff: false,
        steps: [{step_name: 'Requires approval'}]}}, 'input', {execute: async () => {called = true;}}), /durable approval/);
    assert.equal(called, false);
});
test('doctor reports unavailable runtimes without printing credentials or running models', () => {
    const result = spawnSync(process.execPath, [resolve('dist/cli.js'), 'doctor', '--runtime', 'codex:cli', '--json'], {
        encoding: 'utf8', env: {PATH: '', OPENAI_API_KEY: 'must-not-appear'},
    });
    assert.equal(result.status, 1);
    const report = JSON.parse(result.stdout);
    assert.equal(report.nodeSupported, true);
    assert.equal(report.runtimes[0].installed, false);
    assert.equal(report.runtimes[0].authentication, 'not-checked');
    assert.ok(!result.stdout.includes('must-not-appear'));
    const unsupported = spawnSync(process.execPath, [resolve('dist/cli.js'), 'doctor', '--runtime', 'gemini:cli'], {encoding: 'utf8'});
    assert.equal(unsupported.status, 1);
    assert.match(unsupported.stderr, /Unsupported runtime/);
});
