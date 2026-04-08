# Tutorial: Publish Agents as MCP Tools

Expose your CrewForm agents as MCP (Model Context Protocol) tools that Claude Desktop, Cursor, and any MCP-compatible AI client can call directly. This turns your agents into universal AI building blocks.

## What You'll Build

By the end of this tutorial, you'll have:
- A CrewForm agent published as an MCP tool
- Claude Desktop configured to call your agent
- A working end-to-end demo where Claude uses your agent as a tool

## What is MCP?

The [Model Context Protocol](https://modelcontextprotocol.io) is an open standard for connecting AI systems with external tools and data sources. When you publish a CrewForm agent as an MCP server, any MCP-compatible client can discover and invoke it — just like calling a function.

> **CrewForm is one of the few platforms that supports MCP as both client AND server.** Your agents can consume external MCP tools *and* be consumed by other AI systems.

## Prerequisites

- A CrewForm account with at least one configured agent
- [Claude Desktop](https://claude.ai/download) installed (or Cursor)
- An internet-accessible CrewForm instance (cloud or self-hosted with public URL)

## Step 1: Create an Agent Worth Publishing

Let's create a useful agent that Claude Desktop will call as a tool. Example: a code review agent.

1. Go to **Agents → New Agent**
2. Configure:

| Field | Value |
|-------|-------|
| **Name** | Code Reviewer |
| **Description** | Reviews code for bugs, security issues, and best practices. Returns a structured report. |
| **Model** | `claude-sonnet-4-20250514` |
| **Temperature** | 0.2 |

3. System prompt:

```
You are a senior code reviewer specializing in TypeScript, Python, and React.

When given code to review, analyze it for:
1. **Bugs**: Logic errors, off-by-one errors, null reference issues
2. **Security**: SQL injection, XSS, insecure data handling
3. **Performance**: N+1 queries, unnecessary re-renders, memory leaks
4. **Best Practices**: Naming conventions, code organization, DRY violations

Output format:
## Code Review Summary
**Overall Rating**: ⭐⭐⭐⭐ (X/5)

### Issues Found
| # | Severity | Category | Description | Line(s) |
|---|----------|----------|-------------|---------|

### Recommendations
[Numbered list of improvements]

### Positive Notes
[What the code does well]
```

4. Click **Create Agent**

## Step 2: Publish as MCP Tool

1. Open your **Code Reviewer** agent
2. Click the **MCP Publish** button in the header bar
3. The button changes to **MCP Published** (green ✅)

That's it. Your agent is now discoverable and callable via MCP.

> **What happens behind the scenes**: The agent becomes available at your workspace's MCP endpoint as a tool named `code_reviewer` (auto-derived from the agent name). The tool accepts a `message` string parameter and executes the full agent — same model, system prompt, tools, knowledge base, and voice profile as running from the UI.

## Step 3: Generate an MCP API Key

1. Go to **Settings → MCP Servers**
2. Click **Generate MCP API Key**
3. A key prefixed with `cf_mcp_` will be generated
4. Copy the key — you'll need it for the next step

> Each key is scoped to a single workspace. Only that workspace's published agents are visible to clients using that key.

## Step 4: Configure Claude Desktop

1. Open Claude Desktop → **Settings → Developer → MCP Servers**
2. Add a new server with this configuration:

```json
{
  "mcpServers": {
    "crewform": {
      "url": "https://runner.crewform.tech/mcp",
      "headers": {
        "Authorization": "Bearer cf_mcp_your_key_here"
      }
    }
  }
}
```

3. Restart Claude Desktop

> **Self-hosted?** Replace the URL with your task runner's public URL: `https://your-domain.com/mcp`

## Step 5: Test It

1. Open a new conversation in Claude Desktop
2. Ask Claude something like:

```
Can you review this TypeScript function for issues?

function getUser(id: string) {
  const user = db.query("SELECT * FROM users WHERE id = " + id);
  return user[0];
}
```

3. Claude will recognize that it has a `code_reviewer` tool available and call your CrewForm agent
4. Your agent executes with its full configuration and returns the review
5. Claude presents the result in the conversation

## Step 6: Configure Cursor (Alternative)

If you prefer Cursor over Claude Desktop:

1. Create `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "crewform": {
      "url": "https://runner.crewform.tech/mcp",
      "headers": {
        "Authorization": "Bearer cf_mcp_your_key_here"
      }
    }
  }
}
```

2. Restart Cursor — your CrewForm agents now appear as available tools

## Publishing Multiple Agents

You can publish as many agents as you want from the same workspace:

1. Open each agent → click **MCP Publish**
2. All published agents appear as separate tools under the same MCP server
3. Tool names are auto-derived: "Data Analyst" → `data_analyst`, "Bug Fixer" → `bug_fixer`

Claude Desktop (or any MCP client) will see all published agents as available tools and choose the right one based on context.

## Unpublishing

To remove an agent from MCP:

1. Open the agent → click **MCP Published** (the green button)
2. It toggles back to unpublished immediately
3. The agent disappears from the MCP tool list

## Advanced: Full Team Execution

When you publish an agent that belongs to a team, the MCP tool still executes just that individual agent. If you want to trigger a full pipeline or orchestrator team via MCP, create a dedicated "gateway" agent whose system prompt delegates to the appropriate team.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Claude doesn't show the tool | Restart Claude Desktop after adding the config |
| "Unauthorized" error | Check your `cf_mcp_` key is correct and not expired |
| Tool call times out | Complex agents may take longer — consider increasing client timeout |
| Agent not in tool list | Make sure the agent is published (green MCP Published button) |

## What's Next?

- [A2A Protocol](./a2a-protocol.md) — Let external agents discover and delegate tasks to your CrewForm agents
- [AG-UI Protocol](./ag-ui-protocol.md) — Build rich, interactive agent UIs with streaming
- [Knowledge Base](./knowledge-base.md) — Give your published agents access to your documents
