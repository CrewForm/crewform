# Agents Guide

Agents are the core building blocks of CrewForm. Each agent is an AI worker configured with a specific model, system prompt, and capabilities.

## Creating an Agent

Navigate to **Agents → New Agent** or use the `+` button.

### Required Fields

| Field | Description |
|-------|-------------|
| **Name** | Human-readable identifier (e.g., "Code Reviewer") |
| **Model** | LLM model to use (see [Supported Models](#supported-models)) |
| **System Prompt** | Instructions that define the agent's behavior |

### Optional Fields

| Field | Description |
|-------|-------------|
| **Description** | What the agent does (shown in marketplace) |
| **Temperature** | Creativity level (0.0 = deterministic, 1.0 = creative) |
| **Max Tokens** | Maximum response length |
| **Tags** | Categorization for search and marketplace |

## Supported Models

CrewForm supports three LLM providers. You must add your API key in **Settings → API Keys** before using a provider.

### Anthropic (Claude)

| Model | Best For |
|-------|----------|
| `claude-sonnet-4-20250514` | General-purpose, balanced cost/quality |
| `claude-3-5-haiku-20241022` | Fast, cost-effective tasks |
| `claude-3-opus-20240229` | Complex reasoning, analysis |

### Google (Gemini)

| Model | Best For |
|-------|----------|
| `gemini-2.0-flash` | Fast, multimodal tasks |
| `gemini-1.5-pro` | Long-context, complex tasks |

### OpenAI (GPT)

| Model | Best For |
|-------|----------|
| `gpt-4o` | General-purpose, fast |
| `gpt-4-turbo` | Complex reasoning |
| `gpt-3.5-turbo` | Simple, high-volume tasks |

## Writing System Prompts

The system prompt defines your agent's personality, expertise, and output format. Tips:

### Be Specific

```
❌ "You are a helpful assistant."
✅ "You are a senior code reviewer specializing in TypeScript and React.
    You review code for bugs, performance issues, and best practices.
    Output your review as a numbered list with severity (HIGH/MEDIUM/LOW)."
```

### Define Output Format

```
You must respond in the following JSON format:
{
  "summary": "one-line summary",
  "findings": [{ "severity": "HIGH|MEDIUM|LOW", "description": "..." }],
  "recommendation": "overall recommendation"
}
```

### Set Boundaries

```
You ONLY review code. If asked to write new code, respond with:
"I'm configured as a reviewer. Please create a separate coding agent."
```

## Agent Lifecycle

```
Created → Idle → Running (task assigned) → Idle
                    ↓
               Failed (error)
```

- **Idle**: Ready to accept tasks
- **Running**: Actively processing a task
- **Failed**: Task errored — check the task detail for the error message

## Output Routes

By default, when an agent completes a task, the result is broadcast to **all** active output routes (HTTP webhooks, Slack, Discord, Telegram, Teams, Asana) in your workspace. See the [Output Routes guide](./output-routes.md) for how to configure destinations.

You can restrict an agent to deliver results to specific channels only:

1. Open the agent in **Agents → [Agent Name] → Settings**
2. Scroll to **Output Routes**
3. Select one or more channels from the dropdown — or leave blank to send to all

> **Leave blank (default)** = broadcast to all active routes. Select specific channels to narrow delivery.

This is useful when you have multiple output routes (e.g., a `#dev-alerts` Slack channel and a Telegram group) and only want certain agents to send to specific ones.

### How it works

Under the hood, the agent stores a list of route UUIDs in `output_route_ids`:

| Value | Behaviour |
|-------|-----------|
| `null` (default) | Dispatch to all active output routes |
| `[]` (empty array) | Dispatch to no routes |
| `[uuid, ...]` | Dispatch to only those specific routes |

## Using Agents in Teams

Agents become more powerful when combined into teams. See the [Pipeline Teams Guide](./pipeline-teams.md) for multi-agent workflows.

## API Key Security

All API keys are encrypted with **AES-256-GCM** before storage. Keys are:

- Encrypted client-side before being sent to the database
- Never stored in plaintext
- Only decrypted by the task runner at execution time
- Scoped to your workspace via Row-Level Security

See [Settings → API Keys] in the app to manage your provider keys.
