---
title: 'AG-UI Protocol'
description: 'Real-time SSE streaming for frontend integration — the open standard for agent-to-UI communication'
---

## Overview

CrewForm supports the **AG-UI (Agent-User Interaction) protocol**, enabling real-time streaming of agent execution events to any compatible frontend via Server-Sent Events (SSE).

<Info>AG-UI complements MCP (tools) and A2A (agents) — together they form the **three agentic protocols** that CrewForm supports.</Info>

## How It Works

When a CrewForm agent executes a task, the task runner emits structured AG-UI events through an SSE endpoint. Any frontend — CrewForm's dashboard, a custom app, or a CopilotKit integration — can subscribe and display execution in real-time.

```
Agent Executor  →  AG-UI Event Bus  →  SSE Endpoint  →  Your Frontend
```

### Event Types

| Event | Description |
|---|---|
| `RUN_STARTED` | Task execution begins |
| `TEXT_MESSAGE_START` | LLM response stream begins |
| `TEXT_MESSAGE_CONTENT` | LLM response token chunk |
| `TEXT_MESSAGE_END` | LLM response stream ends |
| `TOOL_CALL_START` | Tool execution begins (includes tool name) |
| `TOOL_CALL_ARGS` | Tool call arguments |
| `TOOL_CALL_END` | Tool execution completes (includes result) |
| `RUN_FINISHED` | Task completes successfully |
| `RUN_ERROR` | Task fails with error message |
| `INTERACTION_REQUEST` | Agent pauses and requests user input |
| `INTERACTION_RESPONSE` | User submitted their response |
| `INTERACTION_TIMEOUT` | Interaction timed out without response |

## Rich Interactions

AG-UI supports **bidirectional communication** — agents can pause execution, present choices to the user, and resume based on user input.

### Interaction Types

| Type | When to use | User sees |
|------|------------|-----------|
| `approval` | Agent needs permission before proceeding | Approve / Reject buttons |
| `confirm_data` | Agent wants the user to verify or edit data | Data table with Confirm / Edit / Reject |
| `choice` | Agent needs the user to pick from options | Radio button list with Select |

### How It Works

```
Agent executes → INTERACTION_REQUEST → Agent pauses
                                        ↓
                        User sees modal, makes decision
                                        ↓
                POST /respond → INTERACTION_RESPONSE → Agent resumes
```

### INTERACTION_REQUEST Event

When an agent requests input, the SSE stream emits:

```json
{
  "type": "INTERACTION_REQUEST",
  "timestamp": 1711000010,
  "threadId": "task-uuid",
  "interactionId": "uuid",
  "interactionType": "approval",
  "title": "Deploy to production?",
  "description": "The agent wants to deploy version 2.4.1 to production.",
  "timeoutMs": 300000
}
```

For `confirm_data`, includes a `data` object. For `choice`, includes a `choices` array.

### Submitting a Response

```
POST /ag-ui/:agentId/respond
```

**Body:**
```json
{
  "threadId": "task-uuid",
  "interactionId": "uuid",
  "approved": true
}
```

For `confirm_data`, include `data` with modified values. For `choice`, include `selectedOptionId`.

### React Hook Usage

The `useAgentStream` hook handles interactions automatically:

```typescript
const { status, textContent, pendingInteraction, respond } = useAgentStream(
  'https://your-task-runner-url',
  agentId,
  taskId,
  apiKey,
  true
)

// When an interaction is pending, show the modal
if (pendingInteraction) {
  return (
    <InteractionModal
      interaction={pendingInteraction}
      onRespond={respond}
    />
  )
}
```

### Timeout Behavior

- Default timeout: **5 minutes** per interaction
- When the timeout expires, the agent emits `INTERACTION_TIMEOUT` and the task fails
- The task status transitions: `running` → `waiting_for_input` → `failed`
- Timeout duration is included in the `INTERACTION_REQUEST` event

## Authentication

AG-UI uses the same Bearer token auth as A2A — provide an API key from your workspace's `api_keys` table (provider: `ag-ui` or `a2a`).

## Important Notes

- The SSE stream is **real-time only** — connect before or during task execution
- Events stream for the duration of task execution and close on completion
- The `threadId` maps to a CrewForm task ID
- Works with any AG-UI-compatible client, including CopilotKit
- Rich interactions require a connected SSE client to display the modal — if no client is connected, the interaction will time out

### Request

```
POST /ag-ui/:agentId/sse
```

**Headers:**
```
Content-Type: application/json
Authorization: Bearer YOUR_API_KEY
```

**Body** (RunAgentInput):
```json
{
  "threadId": "task-uuid",
  "runId": "task-uuid"
}
```

### Response

The endpoint returns `text/event-stream` with AG-UI events:

```
data: {"type":"RUN_STARTED","timestamp":1711000000,"threadId":"abc","runId":"abc"}

data: {"type":"TEXT_MESSAGE_START","timestamp":1711000001,"messageId":"msg_1","role":"assistant"}

data: {"type":"TEXT_MESSAGE_CONTENT","timestamp":1711000002,"messageId":"msg_1","delta":"Here is "}

data: {"type":"TEXT_MESSAGE_CONTENT","timestamp":1711000003,"messageId":"msg_1","delta":"the result..."}

data: {"type":"TEXT_MESSAGE_END","timestamp":1711000004,"messageId":"msg_1"}

data: {"type":"RUN_FINISHED","timestamp":1711000005,"threadId":"abc","runId":"abc","result":"Here is the result..."}
```

## Quick Test

### Health Check

```bash
curl http://localhost:3001/ag-ui/health
# → {"status":"ok","protocol":"ag-ui","version":"1.0"}
```

### Stream Events

```bash
# In terminal 1: Connect to SSE stream
curl -N -X POST http://localhost:3001/ag-ui/AGENT_ID/sse \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{"threadId":"TASK_ID","runId":"TASK_ID"}'

# In terminal 2: Trigger the task via API or dashboard
```

## React Hook

CrewForm includes a `useAgentStream` React hook for consuming AG-UI events:

```typescript
import { useAgentStream } from '@/hooks/useAgentStream'

function TaskStreamView({ taskId, agentId, apiKey }) {
  const { status, textContent, toolCalls, error } = useAgentStream(
    'https://your-task-runner-url',
    agentId,
    taskId,
    apiKey,
    true // enabled
  )

  return (
    <div>
      <p>Status: {status}</p>
      <pre>{textContent}</pre>
      {toolCalls.map(tc => (
        <div key={tc.id}>
          🔧 {tc.name}: {tc.status === 'done' ? tc.result : 'running...'}
        </div>
      ))}
    </div>
  )
}
```

### Hook Return Values

| Field | Type | Description |
|---|---|---|
| `status` | `'idle' \| 'connecting' \| 'streaming' \| 'completed' \| 'error'` | Connection state |
| `textContent` | `string` | Accumulated LLM response text |
| `toolCalls` | `AgUiToolCall[]` | Tool calls with name, args, result, status |
| `pendingInteraction` | `AgUiInteractionRequest \| null` | Current interaction awaiting user response |
| `events` | `AgUiEvent[]` | All raw AG-UI events received |
| `error` | `string \| null` | Error message if status is `'error'` |
| `respond` | `(response) => Promise<void>` | Submit a response to a pending interaction |
