# Pipeline Teams Guide

> **CrewForm has three team modes.** Choose the right one for your workflow:
>
> | Mode | How it works | Best for |
> |------|-------------|----------|
> | **Pipeline** ← you are here | Fixed sequential steps — each agent's output feeds the next | Structured multi-step workflows |
> | [Orchestration](./orchestration-teams.md) | A brain agent dynamically delegates to workers | Autonomous, adaptive task execution |
> | [Collaboration](./collaboration-teams.md) | Agents take turns in a shared discussion | Brainstorming, reviews, consensus-building |

Pipeline teams let you chain multiple agents together, where each agent's output feeds into the next. This is ideal for multi-step workflows like research → analysis → report generation.

## How Pipelines Work

```
Input → Agent A → Agent B → Agent C → Final Output
         (step 1)   (step 2)   (step 3)
```

Each step receives:
- The **original task input**
- The **previous step's output** (if not the first step)
- Its own **step instructions** and **expected output format**

## Creating a Pipeline Team

1. Navigate to **Teams → New Team**
2. Give it a name and description
3. Select **Pipeline** as the team mode
4. Add steps in order — each step maps to an agent

### Step Configuration

| Field | Description |
|-------|-------------|
| **Agent** | Which agent executes this step |
| **Step Name** | Label for this step (e.g., "Research") |
| **Instructions** | What this specific step should do |
| **Expected Output** | Format the agent should respond in |
| **On Failure** | `retry` (up to max), `stop` (halt pipeline), or `skip` |
| **Max Retries** | How many times to retry on failure (0–5) |

## Example: Content Pipeline

A three-step pipeline for generating blog posts:

### Step 1: Research Agent
- **Agent**: Research Specialist (Claude Sonnet)
- **Instructions**: "Research the given topic. Find 5 key facts, statistics, and expert quotes."
- **Expected Output**: "Bullet-point list of findings with sources"
- **On Failure**: retry (max 2)

### Step 2: Writer Agent
- **Agent**: Content Writer (GPT-4o)
- **Instructions**: "Using the research provided, write a 1000-word blog post. Use an engaging, professional tone."
- **Expected Output**: "Markdown-formatted blog post with headers"
- **On Failure**: retry (max 1)

### Step 3: Editor Agent
- **Agent**: Copy Editor (Claude Haiku)
- **Instructions**: "Review and polish the blog post. Fix grammar, improve flow, ensure factual accuracy against the research."
- **Expected Output**: "Final polished blog post in Markdown"
- **On Failure**: stop

## Running a Pipeline

1. Go to the team detail page
2. Click **Run Pipeline**
3. Enter the task input (e.g., "Write a blog post about AI in healthcare")
4. Watch each step execute in real-time

The run detail page shows:
- Overall pipeline status
- Per-step status and output
- Token usage per step
- Total execution time

## Pipeline Context

Each step automatically receives context about its position:

```
## Task
[Original input from the user]

## Previous Step Output
[Output from the previous step]

## Your Instructions
[Step-specific instructions]

## Expected Output Format
[What format to respond in]

## Pipeline Context
This is step 3 in a multi-step pipeline. 2 previous steps have completed.
```

## Failure Handling

| Strategy | Behavior |
|----------|----------|
| **Retry** | Re-runs the step (up to max retries). Useful for transient API errors. |
| **Stop** | Halts the entire pipeline. The run is marked as failed. |
| **Skip** | Marks the step as skipped and continues to the next step. The next step won't receive output from the skipped step. |

## Best Practices

1. **Start simple** — Begin with 2-3 steps and add complexity gradually
2. **Specialized agents** — Each agent should do one thing well
3. **Clear handoffs** — Define expected output format so the next step knows what to expect
4. **Use retry for API steps** — LLM APIs can have transient failures
5. **Use stop for critical steps** — If step 1 fails, there's no point running step 2
6. **Monitor costs** — Each step uses tokens; longer pipelines cost more

## Visual Workflow Builder (Canvas)

Pipeline teams include a **Visual Workflow Builder** — a drag-and-drop canvas for designing and managing your pipeline graph.

### Canvas Features

- **Drag agents** from the sidebar onto the canvas to add them as steps
- **Connect nodes** by dragging edges to define execution order
- **Delete nodes** to remove agents from the pipeline
- **Drag to rearrange** — reposition nodes freely; positions are saved automatically

### Undo / Redo

Every canvas action (add, delete, connect, auto-layout) is tracked in a 30-entry history stack.

| Shortcut | Action |
|----------|--------|
| `Ctrl+Z` (`⌘Z` on Mac) | Undo |
| `Ctrl+Shift+Z` (`⌘⇧Z`) | Redo |

You can also use the **⟲ Undo** and **⟳ Redo** buttons in the canvas toolbar.

### Auto-Layout

Click the **Auto-Layout** button in the canvas toolbar to automatically arrange your nodes using the [dagre](https://github.com/dagrejs/dagre) layout algorithm. Pipeline teams use a **top-to-bottom** layout for clear sequential flow.

### Position Persistence

Node positions are saved as part of the team configuration. When you reload the page or revisit the team, your canvas layout is exactly as you left it. No database migration is needed — positions are stored in the existing `teams.config` JSONB column.

## Output Routes

Like individual agents, pipeline teams support targeted output delivery. By default, team run results are broadcast to all active output routes.

To restrict where a team's output is sent:

1. Open **Teams → [Team Name] → Settings**
2. Scroll to **Output Routes**
3. Select one or more specific channels — or leave blank to send to all

This setting applies to the final pipeline result. Individual step outputs are internal and not broadcast.

## Monitoring

View pipeline metrics on the **Analytics** page:
- Total tasks completed per team
- Average execution time
- Token usage breakdown by step
- Cost per pipeline run

## Related

- [Orchestration Teams](./orchestration-teams.md) — Brain agent dynamically delegates to workers
- [Collaboration Teams](./collaboration-teams.md) — Agents discuss and reach consensus
