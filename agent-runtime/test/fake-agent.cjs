#!/usr/bin/env node
// Deterministic protocol peer. Never authenticates or calls a model provider.
const readline = require('node:readline');
const output = (value) => process.stdout.write(JSON.stringify(value) + '\n');
if (process.argv.includes('--json') || process.argv.includes('-p')) {
  let prompt = '';
  process.stdin.on('data', chunk => { prompt += chunk; });
  process.stdin.on('end', () => {
    if (prompt === 'hang') return setInterval(() => {}, 1000);
    if (prompt === 'malformed') return process.stdout.write('invalid JSON\n');
    if (prompt === 'fail') { output({type: 'turn.failed', error: {message: 'quota exhausted'}}); return; }
    const text = prompt === 'inspect' ? JSON.stringify({args: process.argv.slice(2), apiKey: process.env.ANTHROPIC_API_KEY, databaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY}) : 'fixture response';
    if (process.argv.includes('--json')) {
      output({type: 'thread.started', thread_id: 'native-session'});
      output({type: 'item.completed', item: {type: 'agent_message', text}});
      output({type: 'turn.completed'});
    } else {
      output({type: 'stream_event', event: {type: 'content_block_delta', delta: {type: 'text_delta', text}}});
      output({type: 'result', subtype: 'success', result: text, session_id: 'claude-session'});
    }
  });
} else {
  const lines = readline.createInterface({input: process.stdin});
  let promptId;
  lines.on('line', line => {
    const msg = JSON.parse(line);
    if (msg.method === 'initialize') output({jsonrpc: '2.0', id: msg.id, result: {protocolVersion: 1}});
    if (msg.method === 'session/new') output({jsonrpc: '2.0', id: msg.id, result: {sessionId: 'acp-session'}});
    if (msg.method === 'session/prompt') {
      promptId = msg.id;
      if (msg.params.prompt[0].text === 'hang') return;
      output({jsonrpc: '2.0', id: 900, method: 'session/request_permission', params: {sessionId: 'acp-session', options: [{kind: 'allow_once', optionId: 'yes'}]}});
    }
    if (msg.id === 900 && msg.result) {
      output({jsonrpc: '2.0', method: 'session/update', params: {sessionId: 'acp-session', update: {sessionUpdate: 'agent_message_chunk', content: {type: 'text', text: msg.result.outcome.outcome}}}});
      output({jsonrpc: '2.0', id: promptId, result: {stopReason: 'end_turn'}});
    }
  });
}
