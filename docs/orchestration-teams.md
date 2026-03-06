# Orchestration Teams

Orchestration is CrewForm's most autonomous team mode. A **brain agent** receives the task, breaks it down, delegates subtasks to **worker agents**, evaluates their outputs, requests revisions when needed, and synthesises a final answer — all without human intervention.

## How It Works

```
User Input
    │
    ▼
┌──────────────┐        delegate_to_worker()
│  Brain Agent │ ──────────────────────────────► Worker A
│  (Orchestrator)│ ◄──── result ─────────────────
│              │
│              │        delegate_to_worker()
│              │ ──────────────────────────────► Worker B
│              │ ◄──── result ─────────────────
│              │
│              │  [quality < threshold?]
│              │        request_revision()
│              │ ──────────────────────────────► Worker A
│              │ ◄──── revised result ──────────
│              │
│              │        final_answer()
└──────────────┘
    │
    ▼
Final Output
```

The brain operates in a **tool-use loop** — it reasons about the task, issues tool calls (delegate, request revision, accept, or finalise), and receives results back. This continues until `final_answer` is called or the loop safety limit (20 iterations) is reached.

## Creating an Orchestration Team

1. Navigate to **Teams → New Team**
2. Give it a name and description
3. Select **Orchestrator** as the team mode
4. Configure the brain and worker agents (see below)

## Configuration

### Brain Agent

The brain agent is the orchestrator. It receives the original task and is responsible for the full reasoning loop. Choose a capable, instruction-following model here — Claude Opus or GPT-4o work well.

> **Tip:** The brain's system prompt is overridden by CrewForm's orchestrator prompt, which teaches it how to use the delegation tools. The agent's own system prompt is prepended as additional context.

### Worker Agents

Workers are the specialists — each receives a focused subtask from the brain and returns a result. You can add as many workers as needed.

Each worker's system prompt defines their expertise:

```
You are a senior TypeScript developer specialising in React and performance optimisation.
Review the code for bugs, type errors, and performance issues.
```

### Configuration Fields

| Field | Description | Default |
|-------|-------------|---------|
| **Brain Agent** | The orchestrator agent that plans and delegates | Required |
| **Worker Agents** | One or more specialist agents to delegate to | Min 1 |
| **Quality Threshold** | Minimum acceptable quality score (0.0–1.0). Outputs below this trigger a revision request | 0.7 |
| **Max Delegation Depth** | Maximum revision rounds per delegation before the brain must accept or skip | 3 |
| **Routing Strategy** | How the brain selects workers — currently `auto` (brain decides freely) | `auto` |
| **Planner Enabled** | Reserved for future structured planning step (currently unused) | false |

## Brain Agent Tools

The brain agent has four tools available during its reasoning loop:

### `delegate_to_worker`
Sends a subtask to a specific worker agent.

```json
{
  "tool": "delegate_to_worker",
  "arguments": {
    "agent_id": "<worker-agent-id>",
    "instruction": "Analyse the performance bottlenecks in the provided React component and suggest optimisations."
  }
}
```

### `request_revision`
Asks a worker to revise their previous output, with specific feedback.

```json
{
  "tool": "request_revision",
  "arguments": {
    "delegation_id": "<delegation-id>",
    "feedback": "The analysis is too generic. Focus specifically on unnecessary re-renders and memo opportunities."
  }
}
```

### `accept_result`
Marks a delegation as accepted — no further revision needed.

```json
{
  "tool": "accept_result",
  "arguments": {
    "delegation_id": "<delegation-id>"
  }
}
```

### `final_answer`
Submits the synthesised final output. The run completes immediately when this is called.

```json
{
  "tool": "final_answer",
  "arguments": {
    "output": "## Code Review Summary\n\n### Critical Issues\n..."
  }
}
```

## Delegation Lifecycle

Each delegation follows this lifecycle:

```
pending → running → completed
                        │
                  [quality check]
                        │
           ┌── pass ────┴──── fail ──┐
           │                         │
       accepted              revision_requested
                                      │
                                   running (retry)
                                      │
                               completed (or failed)
```

You can monitor the delegation tree in real-time on the run detail page — each delegation shows its status, worker output, and revision history.

## Team Memory

Orchestration teams have **persistent memory** across runs. After each completed run, the output is stored as a memory entry. On subsequent runs, relevant past memories are automatically retrieved and injected into the brain's system prompt.

This means your team improves over time — the brain learns from previous orchestrations on similar tasks.

Memory is scoped to the team — each team has its own memory store that doesn't bleed into other teams.

## Example: Multi-Step Research Report

A three-worker orchestration team for producing research reports:

**Brain Agent** — Claude Opus
- System prompt: "You are a research director. Break complex research tasks into focused subtasks and synthesise professional reports."

**Workers:**
1. **Ava (Researcher)** — "Search and gather factual information, statistics, and expert sources on the given topic."
2. **Sam (Writer)** — "Transform research notes into clear, structured prose. Use professional tone and logical flow."
3. **Smith (Editor)** — "Review and polish written content. Fix grammar, improve clarity, ensure factual accuracy."

**Workflow:**
1. Brain delegates "Research: AI adoption in healthcare 2025" → Ava
2. Brain delegates "Write a 1500-word report from these notes" + Ava's output → Sam
3. Brain evaluates Sam's draft — requests revision if below quality threshold
4. Brain delegates "Final editorial review" → Smith
5. Brain calls `final_answer` with synthesised report

## Monitoring

The run detail page shows the full delegation tree:

- **Delegations panel** — each delegation with status, worker name, instruction, output, and revision count
- **Messages feed** — real-time log of brain decisions and worker responses
- **Token usage** — per-delegation breakdown
- **Delegation depth** — current iteration count in the orchestrator loop

## Tips

- **Brain model matters.** The brain needs to reliably output JSON tool calls. Claude Sonnet 4+ and GPT-4o handle this well. Smaller or older models may produce malformed tool calls.
- **Specific worker prompts = better delegation.** The brain picks workers based on their name and description. Clear, focused descriptions (e.g. "TypeScript code reviewer" vs "AI assistant") lead to better routing.
- **Set quality threshold thoughtfully.** Too high (0.9+) and the brain will loop excessively. Too low (0.3) and poor outputs get accepted. 0.6–0.8 is a good starting range.
- **Watch delegation depth.** If runs are looping on revisions, consider increasing `max_delegation_depth` or lowering the quality threshold, or improving the worker's system prompt.
- **Use team memory.** After a few runs on similar tasks, team memory kicks in and the brain starts with better context.

## Related

- [Pipeline Teams](./pipeline-teams.md) — Fixed sequential steps, no dynamic routing
- [Collaboration Teams](./collaboration-teams.md) — Agents discuss and reach consensus
