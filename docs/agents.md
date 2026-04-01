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

By default, when an agent completes a task, the result is broadcast to **all** active output routes (HTTP webhooks, Slack, Discord, Telegram, Teams, Asana, Trello) in your workspace. See the [Output Routes guide](./output-routes.md) for how to configure destinations.

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

## Voice Profiles

Voice profiles let you control how an agent communicates — its tone, style, and formatting preferences. When a voice profile is configured, it's injected into the system prompt as a `## Voice & Tone` section before each execution.

### Configuring a Voice Profile

1. Open an agent → click the **Voice Profile** tab
2. Select a **Tone Preset** — Formal, Casual, Technical, Creative, Empathetic, or Custom
3. Add **Custom Voice Instructions** — e.g. *"Always refer to customers as 'members'. Use active voice. Avoid jargon."*
4. Add **Output Format Hints** (optional) — e.g. *"Use numbered lists for steps. Keep responses under 200 words."*
5. Click **Save Voice Profile**

### Tone Presets

| Preset | Style |
|--------|-------|
| **Formal** | Professional, structured, precise |
| **Casual** | Friendly, conversational, approachable |
| **Technical** | Detailed, accurate, documentation-style |
| **Creative** | Expressive, engaging, vivid language |
| **Empathetic** | Warm, supportive, understanding |
| **Custom** | Define your own tone |

### Brand Voice Templates

You can save a voice profile as a reusable **Brand Voice Template** that other agents can share:

1. Configure the tone, instructions, and format hints
2. Click **Save as Template** → give it a name (e.g. "Acme Brand Voice")
3. On any other agent, select the template from the **Brand Voice Template** dropdown

This ensures all customer-facing agents (or all internal agents) use the same voice consistently.

### How It Works at Runtime

When the agent runs a task, the system prompt is constructed as:

```
[Agent's base system prompt]

## Voice & Tone
Tone: formal
Always refer to customers as 'members'. Use active voice. Avoid jargon.
Output format: Use numbered lists for steps. Keep responses under 200 words.

[Task instructions]
```

Voice profiles work across **all execution modes** — standalone tasks, pipeline steps, orchestrator delegations, and collaboration discussions.

## Output Templates

Output templates let you format agent output consistently using `{{variable}}` placeholders. Instead of raw LLM text, results are wrapped in a structured template.

### Configuring an Output Template

1. Open an agent → click the **Output Template** tab
2. Select a **Template Type** — Markdown, JSON, HTML, CSV, or Custom
3. Write the **Template Body** using `{{variable}}` syntax:

```markdown
# {{task_title}}

> Generated by **{{agent_name}}** on {{timestamp}}

{{task_result}}

---
*Tokens used: {{tokens_used}} · Model: {{model}}*
```

4. Click **Preview** to see it rendered with sample data
5. Click **Save Template**

### Available Variables

| Variable | Description |
|----------|-------------|
| `{{task_title}}` | Title of the task |
| `{{task_result}}` | Full output from the agent |
| `{{agent_name}}` | Name of the agent that ran the task |
| `{{timestamp}}` | ISO 8601 timestamp of completion |
| `{{tokens_used}}` | Total tokens used during execution |
| `{{model}}` | Model ID used for execution |

### How It Works at Runtime

After the LLM generates its response, the output template is applied:

```
LLM raw output → {{task_result}} slot in template → Final formatted result
```

Missing variables are left as `{{variable_name}}` in the output, so templates degrade gracefully.

## Using Agents in Teams

Agents become more powerful when combined into teams. See the [Pipeline Teams Guide](./pipeline-teams.md) for multi-agent workflows.

## API Key Security

All API keys are encrypted with **AES-256-GCM** before storage. Keys are:

- Encrypted client-side before being sent to the database
- Never stored in plaintext
- Only decrypted by the task runner at execution time
- Scoped to your workspace via Row-Level Security

See [Settings → API Keys] in the app to manage your provider keys.
