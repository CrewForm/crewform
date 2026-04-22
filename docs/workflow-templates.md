---
title: "Workflow Templates"
description: "Create, browse, and install reusable AI workflow blueprints with fill-in-the-blank variables."
---

# Workflow Templates

Workflow Templates are reusable blueprints that bundle agents, teams, and triggers into a single installable package. Users fill in a few variables and get a fully wired workflow in one click.

## Overview

A template captures your entire workflow setup — agents with their prompts, team configuration, pipeline steps, and scheduled triggers — and parameterizes it with `{{variable}}` placeholders. When someone installs your template, they fill in those variables and CrewForm automatically creates everything for them.

```
Template Definition
├── Agents (1 or more)        → Created with resolved prompts
├── Team (optional)           → Pipeline/Orchestrator/Collaboration
│   └── Steps                 → Auto-wired to created agents
└── Trigger (optional)        → CRON schedule or Webhook
```

## Browsing Templates

Navigate to **Marketplace → Templates** to browse published workflow templates.

Each template card shows:
- **Icon & Name** — Quick visual identification
- **Category** — Coaching, Research, Content, DevOps, Reporting, etc.
- **Description** — What the template does
- **Install Count** — Community popularity
- **Resource Summary** — Number of agents, team mode, and trigger type

Click any card to open the Install Modal.

## Installing a Template

1. Click a template card in the Marketplace
2. Review **what will be created** — agents, team, and trigger details
3. **Fill in the variables** — each template defines its own set of configurable values
4. Click **Install Template**
5. CrewForm automatically creates all resources in your workspace

### Variable Resolution

Variables use `{{mustache}}` syntax. During installation, every `{{variable}}` in the template definition (agent prompts, task descriptions, team names, etc.) is replaced with the value you provide.

**Example:** A template with `{{sport}}` and `{{age_group}}` variables in the agent's system prompt:

```
You are a {{sport}} coach for {{age_group}} players.
Focus on: {{focus_areas}}
```

When installed with `sport = "rugby"`, `age_group = "under 9s"`, and `focus_areas = "tackling, passing, positioning"`:

```
You are a rugby coach for under 9s players.
Focus on: tackling, passing, positioning
```

## Creating a Template

There are two ways to create a workflow template:

### From the Marketplace

1. Click **+ Create Template** in the Marketplace header
2. Follow the 4-step wizard:

| Step | What You Do |
|------|------------|
| **1. Select** | Pick agents and optionally a team from your workspace |
| **2. Variables** | Auto-scans `{{variable}}` patterns from prompts; define labels, placeholders, defaults |
| **3. Metadata** | Set name, description, icon, category, tags, and optional CRON/webhook trigger |
| **4. Preview** | Review everything before publishing |

### From an Agent

1. Open any agent's detail page
2. Click the **Template** button in the header
3. The wizard opens with that agent pre-selected

### Variable Tips

- Use descriptive variable names: `{{target_audience}}` not `{{var1}}`
- Provide sensible defaults so users can install quickly
- Mark variables as required only if the template won't work without them
- Variables work anywhere in the template definition — prompts, names, descriptions, trigger configs

## Built-in Templates

CrewForm ships with 5 starter templates:

### 🏉 Weekly Sports Coach
A single-agent workflow with a CRON trigger that delivers weekly coaching tips.

**Variables:** `sport`, `age_group`, `focus_areas`, `cron_expression`

**Creates:** 1 agent + 1 CRON trigger (default: every Friday at 9am)

---

### 📝 Content Research Pipeline
A 3-agent pipeline for topic research, content writing, and editing.

**Variables:** `topic`, `target_audience`, `tone`

**Creates:** 3 agents (Researcher, Writer, Editor) + 1 pipeline team

---

### 📰 Daily News Digest
A 2-agent pipeline that gathers and summarizes industry news on a schedule.

**Variables:** `industry`, `news_sources`, `output_format`

**Creates:** 2 agents (Gatherer, Summarizer) + 1 pipeline team + 1 CRON trigger (weekdays at 7am)

---

### 🔍 Code Review Assistant
A single-agent webhook-triggered workflow for automated code reviews.

**Variables:** `language`, `coding_standards`, `severity_level`

**Creates:** 1 agent + 1 webhook trigger

---

### 📊 Weekly Report Generator
A 2-agent pipeline for data analysis and report writing on a weekly schedule.

**Variables:** `department`, `key_metrics`, `stakeholders`

**Creates:** 2 agents (Analyst, Writer) + 1 pipeline team + 1 CRON trigger (Mondays at 8am)

## Template Definition Schema

For advanced users, templates are stored as JSONB with this structure:

```typescript
interface TemplateDefinition {
  agents: TemplateAgentDef[]   // Required: at least 1 agent
  team: TemplateTeamDef | null // Optional: team configuration
  trigger: TemplateTriggerDef | null // Optional: CRON or webhook
}

interface TemplateVariable {
  key: string         // Variable key (e.g. "sport")
  label: string       // Display label (e.g. "Sport")
  type: 'text' | 'number' | 'select'
  placeholder: string // Input placeholder
  required: boolean   // Must be filled before install
  default: string     // Pre-filled default value
}
```

## Database

Templates are stored in the `workflow_templates` table with:
- **RLS policies** — creators can manage their own; all users can read published templates
- **JSONB storage** — template definitions and variables stored as flexible JSON
- **Install counter** — tracks how many times each template has been installed
- **Indexes** — optimized for category, tag, and full-text search queries

## Next Steps

- [Agents Guide](/agents) — Learn how agents work before templating them
- [Pipeline Teams](/pipeline-teams) — Understand team modes for multi-agent templates
- [Marketplace](/agents#marketplace) — Browse and install community templates
