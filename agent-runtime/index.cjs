// SPDX-License-Identifier: AGPL-3.0-or-later
const { spawn } = require('node:child_process');
const { realpathSync } = require('node:fs');
const { isAbsolute } = require('node:path');
const { StringDecoder } = require('node:string_decoder');

const agents = ['codex', 'claude', 'gemini', 'copilot'];
const MAX_BYTES = 8 * 1024 * 1024;
const active = new Set();

function parseExecution(config) {
  const value = config?.execution;
  if (value === undefined || value?.kind === 'api') return null;
  if (!value || value.kind !== 'external' || !agents.includes(value.agent) ||
      !['cli', 'acp'].includes(value.transport) ||
      (value.transport === 'cli' && !['codex', 'claude'].includes(value.agent))) {
    throw new Error('Invalid execution configuration. Use Codex/Claude CLI or an ACP agent.');
  }
  if (value.timeoutMs !== undefined && (!Number.isInteger(value.timeoutMs) || value.timeoutMs < 1000 || value.timeoutMs > 3600000)) {
    throw new Error('External timeout must be between 1000 and 3600000 milliseconds.');
  }
  return {kind: 'external', agent: value.agent, transport: value.transport, timeoutMs: value.timeoutMs};
}

// Never forward database, provider API keys or CrewForm service credentials.
// Authentication belongs to the installed agent and its own credential store.
function nativeEnvironment() {
  const result = {};
  for (const name of ['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'TEMP', 'TMP', 'SystemRoot', 'APPDATA', 'LOCALAPPDATA',
    'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'CODEX_HOME', 'CLAUDE_CONFIG_DIR', 'LANG', 'LC_ALL',
    'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE']) {
    if (process.env[name]) result[name] = process.env[name];
  }
  return result;
}

function commandFor(execution, model) {
  const {agent, transport} = execution;
  const override = process.env[`CREWFORM_${agent.toUpperCase()}_${transport.toUpperCase()}_PATH`];
  if (override && !isAbsolute(override)) throw new Error('Agent executable overrides must be absolute paths.');
  let command = override || agent;
  let args;
  if (transport === 'acp') {
    if (agent === 'codex' || agent === 'claude') {
      command = override || (agent === 'codex' ? 'codex-acp' : 'claude-agent-acp');
      args = [];
    } else args = agent === 'gemini' ? ['--acp'] : ['--acp', '--stdio'];
  } else if (agent === 'codex') {
    args = ['exec', '--json', '--sandbox', 'read-only', '--skip-git-repo-check', '--color', 'never', '-'];
    if (model && model !== 'default') args.splice(args.length - 1, 0, '--model', model);
  } else {
    // No native tools in noninteractive Claude mode. No permission bypass flags.
    args = ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--tools', '', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--disable-slash-commands', '--settings', '{"disableAllHooks":true}', '--setting-sources', 'user'];
    if (model && model !== 'default') args.push('--model', model);
  }
  return {command, args};
}

async function executeExternal(execution, input) {
  execution = parseExecution({execution});
  const cwd = realpathSync(input.cwd);
  if (input.signal?.aborted) throw new Error('External execution cancelled.');
  // Fail fast rather than exhaust a native account through concurrent team steps.
  const lock = execution.agent;
  if (active.has(lock)) throw new Error(`${lock} already has an active local execution. Retry when it completes.`);
  active.add(lock);
  try { return await runProcess(execution, {...input, cwd}); }
  finally { active.delete(lock); }
}

function runProcess(execution, input) {
  return new Promise((resolve, reject) => {
    const {command, args} = commandFor(execution, input.model);
    const child = spawn(command, args, {cwd: input.cwd, env: nativeEnvironment(), shell: false, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe']});
    let settled = false, bytes = 0, buffer = '', stderr = '', result = '', sessionId, finalSeen = false;
    let nextId = 1;
    const pending = new Map();
    const decoder = new StringDecoder('utf8');
    const prompt = [input.systemPrompt, input.prompt].filter(Boolean).join('\n\n');
    const kill = () => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      try { if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGTERM'); else child.kill('SIGTERM'); } catch { /* already exited */ }
      const timer = setTimeout(() => {
        if (child.exitCode !== null || child.signalCode !== null) return;
        try { if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL'); } catch { /* already exited */ }
      }, 1000);
      timer.unref();
    };
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      input.signal?.removeEventListener('abort', abort);
      process.removeListener('SIGTERM', abort);
      process.removeListener('SIGINT', abort);
      for (const entry of pending.values()) entry.reject(error || new Error('Agent session closed.'));
      pending.clear();
      kill();
      if (error) reject(error);
      else resolve({result, usage: {promptTokens: 0, completionTokens: 0, totalTokens: 0, costEstimateUSD: 0, usageKnown: false, billingModel: 'unknown'}, toolCallLogs: [],
        execution: {agent: execution.agent, transport: execution.transport, authentication: 'native-login', billingModel: 'unknown', usageKnown: false, ...(sessionId ? {sessionId} : {})}});
    };
    const send = (message) => { if (!settled) child.stdin.write(JSON.stringify(message) + '\n'); };
    const request = (method, params) => new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, {resolve, reject});
      send({jsonrpc: '2.0', id, method, params});
    });
    const abort = () => {
      if (sessionId && execution.transport === 'acp') send({jsonrpc: '2.0', method: 'session/cancel', params: {sessionId}});
      finish(new Error('External execution cancelled.'));
    };
    const timeout = setTimeout(() => finish(new Error('External agent timed out. No API fallback was attempted.')), execution.timeoutMs || 300000);
    input.signal?.addEventListener('abort', abort, {once: true});
    process.once('SIGTERM', abort);
    process.once('SIGINT', abort);
    const append = (text) => { result += text; input.onChunk?.(text); };
    const handle = (message) => {
      if (execution.transport === 'acp') {
        if (message.method === 'session/request_permission' && message.id !== undefined) {
          // Unattended ACP execution refuses ALL permissions. Native agent policies
          // still apply: ACP itself is not an OS sandbox.
          send({jsonrpc: '2.0', id: message.id, result: {outcome: {outcome: 'cancelled'}}});
        } else if (message.method && message.id !== undefined) {
          send({jsonrpc: '2.0', id: message.id, error: {code: -32601, message: 'Client capability unavailable'}});
        } else if (message.method === 'session/update' && message.params?.sessionId === sessionId) {
          const update = message.params.update;
          if (update?.sessionUpdate === 'agent_message_chunk' && update.content?.type === 'text') append(update.content.text);
        } else if (message.id !== undefined && pending.has(message.id)) {
          const entry = pending.get(message.id); pending.delete(message.id);
          if (message.error) entry.reject(new Error(`ACP request failed: ${message.error.message || message.error.code}`));
          else entry.resolve(message.result);
        }
      } else if (execution.agent === 'codex') {
        if (message.type === 'thread.started') sessionId = message.thread_id;
        if (message.type === 'item.completed' && message.item?.type === 'agent_message') append((result ? '\n\n' : '') + message.item.text);
        if (message.type === 'turn.completed') finalSeen = true;
        if (message.type === 'turn.failed' || message.type === 'error') throw new Error(message.error?.message || message.message || 'Codex failed.');
      } else {
        if (message.type === 'stream_event' && message.event?.type === 'content_block_delta' && message.event.delta?.type === 'text_delta') append(message.event.delta.text);
        if (message.type === 'result') {
          if (message.is_error || message.subtype !== 'success') throw new Error(message.result || 'Claude failed.');
          sessionId = message.session_id;
          if (!result) append(message.result || '');
          else if (typeof message.result === 'string') result = message.result;
          finalSeen = true;
        }
      }
    };
    child.on('error', (error) => finish(new Error(`Cannot run ${command}: ${error.code || error.message}. Install the agent and sign in using its own CLI.`)));
    child.stdin.on('error', (error) => finish(new Error(`Agent input failed: ${error.message}`)));
    child.stderr.on('data', (data) => { stderr = (stderr + data.toString()).slice(-4000); });
    child.stdout.on('data', (data) => {
      if (settled) return;
      bytes += data.length;
      if (bytes > MAX_BYTES) return finish(new Error('External agent output exceeded 8 MiB.'));
      buffer += decoder.write(data);
      const lines = buffer.split('\n'); buffer = lines.pop();
      try { for (const line of lines) if (line.trim()) handle(JSON.parse(line)); }
      catch (error) { finish(new Error(`Invalid agent output: ${error.message}`)); }
    });
    child.on('close', (code) => {
      if (settled) return;
      try { buffer += decoder.end(); if (buffer.trim()) handle(JSON.parse(buffer)); }
      catch (error) { return finish(error); }
      if (code !== 0) return finish(new Error(`External agent exited with ${code}. Check native login and account limits.${stderr ? ' See the agent directly for diagnostics.' : ''}`));
      if (!finalSeen) return finish(new Error('Agent exited without a completed response.'));
      finish();
    });
    if (execution.transport === 'cli') child.stdin.end(prompt);
    else {
      (async () => {
        const initialized = await request('initialize', {protocolVersion: 1, clientCapabilities: {}, clientInfo: {name: 'crewform', version: '0.1.0'}});
        if (initialized?.protocolVersion !== 1) throw new Error('Unsupported ACP protocol version.');
        const session = await request('session/new', {cwd: input.cwd, mcpServers: []});
        if (typeof session?.sessionId !== 'string') throw new Error('ACP agent did not return a session ID.');
        sessionId = session.sessionId;
        if (input.model && input.model !== 'default') throw new Error('ACP model overrides are not supported yet. Use the native agent default.');
        const completed = await request('session/prompt', {sessionId, prompt: [{type: 'text', text: prompt}]});
        if (completed?.stopReason !== 'end_turn') throw new Error(`ACP turn did not complete: ${completed?.stopReason || 'missing stop reason'}`);
        finalSeen = true;
        finish();
      })().catch(finish);
    }
  });
}

module.exports = {parseExecution, executeExternal, nativeEnvironment};
