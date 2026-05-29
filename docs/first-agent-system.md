---
title: 'Run Your First Agent System'
description: 'Use the golden-path Research Brief demo to run a real multi-agent workflow in CrewForm.'
---

# Run Your First Agent System

This is the fastest way to see CrewForm work end-to-end. You will set up one provider key, activate the prebuilt Research Brief Pipeline, run a real team workflow, and inspect the output.

<Info>
  The demo uses the normal CrewForm execution path. It creates real agents, a real pipeline team, and a real team run that is picked up by the task runner.
</Info>

## What You Will Run

The golden-path demo creates a 3-step pipeline:

| Step | Agent | What It Does |
|---|---|---|
| Research | Research Analyst | Builds market context, findings, trends, assumptions, and verification notes |
| Analyze | Data Analyst | Prioritizes insights, opportunities, risks, and recommended structure |
| Write Brief | Content Writer | Produces a polished markdown executive brief |

Default prompt:

```text
Research the market for AI customer support tools and produce a short executive brief.
```

## 1. Start CrewForm

Use the hosted app:

```text
https://app.crewform.tech
```

Or run locally:

```bash
git clone https://github.com/CrewForm/crewform.git
cd crewform
npm install
cp .env.example .env.local
npm run dev
```

The task runner must also be running for real execution:

```bash
cd task-runner
npm install
cp .env.example .env
# Add SUPABASE_URL / VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
npm run dev
```

## 2. Add One Provider Key

Open **Settings → LLM Setup** and add an active OpenAI key.

The demo agents use `gpt-4o-mini` by default so the run is fast and low-cost. You can change the models later from the agent configuration pages.

## 3. Activate the Demo Workspace

Return to **Dashboard** and choose **Activate Demo Workspace**.

CrewForm will create:

- 5 demo agents
- 1 Research Brief Pipeline team
- Team membership and pipeline step wiring

The demo data is removable from the dashboard banner at any time.

## 4. Run the Demo

After the demo is active, choose **Run Demo** from the dashboard banner.

CrewForm will create a real `team_run` and open the run detail page. You should see:

- Current pipeline step
- Agent handoffs
- Running/completed status
- Final markdown output
- Token and cost totals when the run completes

## 5. Inspect the Result

When the run finishes, review:

- The final executive brief
- Step-by-step messages
- Token usage and estimated cost
- Any error or retry details if a step failed

From there, open the team page to customize the prompt, agents, model, tools, or pipeline steps.

## Troubleshooting

| Problem | What To Check |
|---|---|
| The **Run Demo** button says **Add OpenAI Key** | Add and activate an OpenAI provider key in Settings |
| The run stays pending | Make sure the task runner is running and connected to Supabase |
| The run fails immediately | Check that your provider key is valid and the selected model is available |
| The output is too generic | Add more detail to the run prompt or enable tools/knowledge sources |

## Next Steps

- [Pipeline Teams](/pipeline-teams) — Understand how fixed multi-agent workflows execute
- [Visual Workflow Builder](/visual-workflow-builder) — Edit and observe the workflow on the canvas
- [Observability](/observability) — Add Langfuse or an OTLP backend for traces
- [API Reference](/api-reference) — Trigger runs from scripts and external systems
