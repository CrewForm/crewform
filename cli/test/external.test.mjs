import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { parseConfigFile } from '../dist/config.js';
import { executeAgent } from '../dist/executor.js';
const directory = mkdtempSync(resolve(tmpdir(), 'crewform-cli-test-'));
const cli = resolve('dist/cli.js');
const peer = resolve('../agent-runtime/test/fake-agent.cjs');
chmodSync(peer, 0o755);
const env = {...process.env, CREWFORM_CODEX_CLI_PATH: peer, CREWFORM_CLAUDE_CLI_PATH: peer};
after(() => rmSync(directory, {recursive: true, force: true}));
test('init, validate and JSON execution work without a workspace or API key', () => {
    const file = resolve(directory, 'agent.json');
    execFileSync(process.execPath, [cli, 'init', '--runtime', 'codex', '--output', file], {env});
    execFileSync(process.execPath, [cli, 'validate', file], {env});
    const output = JSON.parse(execFileSync(process.execPath, [cli, 'run', file, 'hello', '--json'], {env, encoding: 'utf8'}));
    assert.equal(output.result, 'fixture response');
    assert.equal(output.execution.authentication, 'native-login');
    assert.equal(output.usage.usageKnown, false);
    assert.equal(output.usage.costEstimateUSD, null);
});
test('invalid transports and implicit API fallback are rejected by validation', () => {
    const file = resolve(directory, 'invalid.json');
    writeFileSync(file, JSON.stringify({model: 'default', fallback_model: 'gpt-4o', config: {execution: {kind: 'external', agent: 'claude', transport: 'cli'}}}));
    assert.throws(() => parseConfigFile(file), /no automatic API fallback/);
});
test('three shipped examples validate and sequential native handoffs preserve unknown usage', () => {
    for (const name of ['local-review', 'release-notes', 'evidence-brief']) parseConfigFile(resolve('../examples', `${name}.json`));
    const output = JSON.parse(execFileSync(process.execPath, [cli, 'run', resolve('../examples/evidence-brief.json'), 'fixture sources', '--json'], {env, encoding: 'utf8'}));
    assert.equal(output.steps.length, 3);
    assert.ok(output.steps.every(step => step.status === 'completed' && step.usage.usageKnown === false));
    assert.equal(output.usage.costEstimateUSD, null);
});
test('model API execution still streams through the existing provider engine', async () => {
    let requests = 0;
    const server = createServer((request, response) => {
        requests++;
        assert.equal(request.url, '/v1/chat/completions');
        response.writeHead(200, {'content-type': 'text/event-stream'});
        response.write(`data: ${JSON.stringify({choices: [{delta: {content: 'API result'}}]})}\n\n`);
        response.write(`data: ${JSON.stringify({choices: [], usage: {prompt_tokens: 2, completion_tokens: 3}})}\n\n`);
        response.end('data: [DONE]\n\n');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        const file = resolve(directory, 'api.json');
        writeFileSync(file, JSON.stringify({model: 'llama3.3', provider: 'ollama'}));
        const config = parseConfigFile(file);
        const result = await executeAgent(config.agent, {prompt: 'hello', ollamaBaseUrl: `http://127.0.0.1:${server.address().port}/v1`});
        assert.equal(result.result, 'API result'); assert.equal(requests, 1);
        assert.equal(result.usage.totalTokens, 5);
    } finally { await new Promise(resolve => server.close(resolve)); }
});
