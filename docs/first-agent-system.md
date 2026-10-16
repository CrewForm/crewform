---
title: 'Run Your First Agent System'
description: 'Run the three-step Research Brief demo using supplied fictional evidence.'
---

# Run Your First Agent System

The dashboard demo runs a real three-agent pipeline against supplied fictional
interview notes. It uses an active OpenAI API key and can incur provider charges.
For a walkthrough without accounts or model requests, start with the scripted
offline review pack in the [Quick Start](/quickstart).

## 1. Start CrewForm

Use [CrewForm Cloud](https://app.crewform.tech), or follow the complete
[local self-hosting setup](/self-hosting). The frontend, task runner and Supabase
backend must all be running for real execution.

## 2. Add a provider key

Open **Settings → LLM Setup** and add an active OpenAI key. The demo's three agents
use `gpt-4o-mini`. Check provider access and spending limits before running it.
The dashboard demo uses API execution; it does not consume a paired laptop login.

## 3. Activate the demo workspace

On **Dashboard**, choose **Activate Demo Workspace**. CrewForm creates three demo
agents and one Research Brief Pipeline team. Your workspace needs capacity for
those agents under its hosting allowance.

| Step | Agent | Result |
|---|---|---|
| Extract Evidence | Research Analyst | Findings tied to the supplied note IDs |
| Analyze | Data Analyst | Priorities, risks and unknowns grounded in those findings |
| Write Brief | Content Writer | Markdown executive brief with evidence and next questions |

The supplied notes are labeled `[S1]`–`[S4]`. They describe fictional developers'
preferences about existing agent subscriptions, local execution, setup and run
visibility. The prompt requires citations and treats missing information as unknown.
These notes do **not** establish market size, prices or general customer demand.

## 4. Run and inspect

Choose **Run Demo**. CrewForm creates a real team run and opens its detail page.
Inspect the current step, handoff messages, final output, errors and usage when
reported. Check every claim against the supplied notes; a fluent brief can still
contain unsupported conclusions.

If the live connection drops, check the persisted run status before starting another
run. A disconnected view does not establish that the underlying execution failed.

## Troubleshooting

| Problem | What to check |
|---|---|
| Button says **Add OpenAI Key** | Add and activate a valid OpenAI key in Settings |
| Activation reports a limit | The workspace needs room for three demo agents |
| Run stays pending | Verify the task runner is running and connected to Supabase |
| Run fails | Inspect the saved error, provider access and selected model availability |
| Unsupported findings | Keep the supplied sources and request citations and explicit unknowns |

Use the dashboard banner to remove the demo when finished. Review the removal
confirmation before deleting its agents and team.

## Next steps

- [Pipeline Teams](/pipeline-teams) — Configure fixed handoffs
- [Visual Workflow Builder](/visual-workflow-builder) — Edit the workflow
- [Local Agent Execution](/local-agents) — Use existing installed agents
- [Observability](/observability) — Export traces
