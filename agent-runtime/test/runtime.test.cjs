const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { chmodSync } = require('node:fs');
const { resolve } = require('node:path');
const { executeExternal, parseExecution, nativeEnvironment } = require('../index.cjs');
const fixture = resolve(__dirname, 'fake-agent.cjs');
chmodSync(fixture, 0o755);
for (const agent of ['CODEX', 'CLAUDE', 'GEMINI', 'COPILOT']) {
  for (const transport of ['CLI', 'ACP']) process.env[`CREWFORM_${agent}_${transport}_PATH`] = fixture;
}
after(() => { for (const key of Object.keys(process.env)) if (/^CREWFORM_.*_PATH$/.test(key)) delete process.env[key]; });
const run = (agent, transport, prompt, extra = {}) => executeExternal({kind: 'external', agent, transport}, {cwd: __dirname, prompt, ...extra});
test('validation rejects executable injection and unsupported CLI transports', () => {
  assert.throws(() => parseExecution({execution: {kind: 'external', agent: 'sh', transport: 'cli'}}));
  assert.throws(() => parseExecution({execution: {kind: 'external', agent: 'gemini', transport: 'cli'}}));
  assert.throws(() => parseExecution({execution: {kind: 'external', agent: 'codex', transport: 'cli', timeoutMs: 0}}));
  assert.equal(parseExecution({}), null);
});
test('Codex native JSON, bounded sandbox and secrets isolation', async () => {
  process.env.ANTHROPIC_API_KEY = 'test-provider-secret';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-secret';
  try {
    const result = await run('codex', 'cli', 'inspect');
    const inspected = JSON.parse(result.result);
    assert.equal(inspected.apiKey, undefined); assert.equal(inspected.databaseKey, undefined);
    assert.deepEqual(inspected.args.slice(0, 5), ['exec', '--json', '--sandbox', 'read-only', '--color']);
    assert.equal(result.execution.sessionId, 'native-session');
    assert.equal(result.usage.usageKnown, false); assert.equal(result.execution.billingModel, 'unknown');
    assert.equal(nativeEnvironment().SUPABASE_SERVICE_ROLE_KEY, undefined);
  } finally { delete process.env.ANTHROPIC_API_KEY; delete process.env.SUPABASE_SERVICE_ROLE_KEY; }
});
test('Claude native result, native tools disabled and streamed output', async () => {
  let streamed = '';
  const result = await run('claude', 'cli', 'inspect', {onChunk: text => { streamed += text; }});
  const args = JSON.parse(result.result).args;
  assert.equal(args[args.indexOf('--tools') + 1], ''); assert.equal(streamed, result.result);
});
test('ACP handshake, streaming, permission denial and native session ID', async () => {
  const result = await run('gemini', 'acp', 'permissions');
  assert.equal(result.result, 'cancelled'); assert.equal(result.execution.sessionId, 'acp-session');
});
test('native failures and malformed events fail without fallback', async () => {
  await assert.rejects(run('codex', 'cli', 'fail'), /quota exhausted/);
  await assert.rejects(run('claude', 'cli', 'malformed'), /Invalid agent output/);
});
test('cancellation terminates an ACP session and account concurrency fails fast', async () => {
  const controller = new AbortController();
  const running = run('copilot', 'acp', 'hang', {signal: controller.signal});
  await assert.rejects(run('copilot', 'acp', 'another'), /already has an active/);
  controller.abort();
  await assert.rejects(running, /cancelled/);
});
test('timeout is bounded and pre-cancelled jobs never spawn', async () => {
  await assert.rejects(executeExternal({kind: 'external', agent: 'codex', transport: 'cli', timeoutMs: 1000}, {cwd: __dirname, prompt: 'hang'}), /timed out/);
  await assert.rejects(run('codex', 'cli', 'hello', {signal: AbortSignal.abort()}), /cancelled/);
});
