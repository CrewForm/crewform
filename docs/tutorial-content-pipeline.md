# Tutorial: Build a Content Pipeline Team

Create a multi-agent content pipeline that researches a topic, writes an article, and edits it — all automatically. This tutorial showcases CrewForm's Pipeline Team mode, where agents execute sequentially, each building on the previous agent's output.

## What You'll Build

A 3-agent pipeline that:
1. **Researcher** — Gathers information and key points on a topic
2. **Writer** — Transforms research into a polished article draft
3. **Editor** — Reviews, refines, and produces the final version

## Prerequisites

- A CrewForm account with at least one LLM API key configured
- 5–10 minutes

## Step 1: Create the Research Agent

1. Go to **Agents → New Agent**
2. Configure:

| Field | Value |
|-------|-------|
| **Name** | Topic Researcher |
| **Model** | `gpt-4o` or `claude-sonnet-4-20250514` |
| **Temperature** | 0.5 |

3. System prompt:

```
You are a thorough research analyst. Given a topic, you produce a comprehensive research brief.

Your output must include:
- **Key Facts**: 5-8 important facts or statistics
- **Main Arguments**: 3-4 key perspectives or angles
- **Target Audience**: Who would read an article on this topic
- **Suggested Structure**: An outline for a 1,000-word article
- **Sources to Reference**: Suggest specific types of sources that would strengthen the article

Format your output as clean markdown with clear headers.
```

4. Click **Create Agent**

## Step 2: Create the Writer Agent

1. Create another agent:

| Field | Value |
|-------|-------|
| **Name** | Content Writer |
| **Model** | `claude-sonnet-4-20250514` |
| **Temperature** | 0.7 (slightly higher for creativity) |

2. System prompt:

```
You are a professional content writer. You receive a research brief and transform it into a polished, engaging article.

Rules:
- Write approximately 800-1,200 words
- Use an engaging, conversational tone suitable for a tech blog
- Include a compelling introduction and conclusion
- Use headers (H2/H3) to organize sections
- Incorporate the key facts and arguments from the research brief
- Write for the target audience identified in the brief
- Do NOT add content that wasn't in the research brief — stay factual

Output: A complete article in markdown format.
```

## Step 3: Create the Editor Agent

1. Create a third agent:

| Field | Value |
|-------|-------|
| **Name** | Content Editor |
| **Model** | `claude-sonnet-4-20250514` |
| **Temperature** | 0.2 (low for precision) |

2. System prompt:

```
You are a meticulous senior editor. You receive a draft article and produce the final, publish-ready version.

Your editing checklist:
1. Fix any grammar, spelling, or punctuation errors
2. Improve sentence clarity and flow
3. Ensure consistent tone and voice
4. Check that the article has a strong opening hook
5. Verify logical flow between sections
6. Add a compelling meta description (under 160 characters)
7. Suggest 3-5 SEO-friendly tags

Output format:
## Final Article
[The edited article in markdown]

## Meta Description
[Under 160 characters]

## Tags
[Comma-separated list]

## Editor's Notes
[Any significant changes or suggestions for the author]
```

## Step 4: Create the Pipeline Team

1. Go to **Teams → New Team**
2. Select **Pipeline** mode
3. Name it: *Content Production Pipeline*
4. Add agents in order:
   - **Step 1**: Topic Researcher
   - **Step 2**: Content Writer
   - **Step 3**: Content Editor
5. Click **Create Team**

> **How pipelines work**: Each agent receives the previous agent's output as its input. The Researcher's output becomes the Writer's input, and the Writer's output becomes the Editor's input.

## Step 5: Run the Pipeline

1. Go to **Teams → Content Production Pipeline**
2. Click **Run Team**
3. Enter a topic: *"The impact of Agent-to-Agent protocols on enterprise AI adoption"*
4. Watch the pipeline execute:
   - The Researcher produces a research brief
   - The Writer transforms it into an article
   - The Editor polishes and publishes the final version
5. View the final result in the team run detail page

## Step 6: Visualize in the Workflow Builder

1. Open your team → click **Visual Builder**
2. See your 3 agents arranged as connected nodes in the canvas
3. Each node shows the agent name, model, and execution status
4. Use this view to rearrange, add/remove agents, or branch the pipeline

## Step 7: Deliver Results Automatically

Set up an output route so finished articles are delivered automatically:

1. Go to **Settings → Output Routes → Add Route**
2. Choose **Webhook** and enter your CMS API endpoint, or
3. Choose **Slack** to post finished articles to a `#content-review` channel
4. On the Editor agent, set **Output Routes** to your chosen destination

Now every time you run the pipeline, the final article lands where your team needs it.

## Extend the Pipeline

Here are ideas to make this pipeline more powerful:

- **Add a 4th agent**: An SEO Optimizer that adds internal links, adjusts headings, and optimizes keyword density
- **Fan-out**: Use [Fan-Out Pipelines](./pipeline-teams.md) to have multiple writers produce competing drafts, then a merge agent picks the best one
- **Schedule**: Use **Zapier Integration** to trigger the pipeline on a schedule (daily content generation)
- **Knowledge Base**: Give the Researcher agent a knowledge base with your company's style guide and brand guidelines

## What's Next?

- [Orchestration Teams](./orchestration-teams.md) — Let a brain agent decide which workers to delegate to dynamically
- [Collaboration Teams](./collaboration-teams.md) — Agents discuss and reach consensus on complex decisions
- [Visual Workflow Builder](./visual-workflow-builder.md) — Drag-and-drop canvas for designing workflows
