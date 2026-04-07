---
title: 'MCP Protocol'
description: 'Connect agents to thousands of external tool servers via the Model Context Protocol'
---

## Overview

CrewForm is a **full MCP participant** — both as a client (consuming external tools) and as a server (exposing agents as tools). Your agents can discover and autonomously invoke tools from any MCP-compatible server during task execution, giving them access to databases, APIs, file systems, code execution environments, and thousands of third-party services.

<Info>MCP is one of three agentic protocols CrewForm supports, alongside [A2A](/a2a-protocol) (agent-to-agent) and [AG-UI](/ag-ui-protocol) (agent-to-frontend).</Info>

## Architecture

CrewForm implements the full MCP client lifecycle using the official `@modelcontextprotocol/sdk`:

```
┌─────────────────────────────────────────────────────────────────┐
│  Task Execution (executor.ts)                                   │
│                                                                 │
│  1. Agent has mcp: tools enabled                                │
│  2. Task Runner fetches MCP server configs from DB              │
│  3. MCP Client connects to each server (HTTP/SSE/stdio)         │
│  4. Tools discovered via tools/list                             │
│  5. Tool definitions injected into LLM function calling schema  │
│  6. LLM invokes MCP tools → mcpClient.callMcpTool()             │
│  7. Results flow back into the agent's reasoning loop           │
│  8. MCP clients disconnected after task completes               │
└─────────────────────────────────────────────────────────────────┘
```

## Runtime Execution

When a task runs, CrewForm's task runner **automatically connects to configured MCP servers and makes their tools available** to the agent. This happens transparently — the agent's LLM sees MCP tools alongside built-in tools and can invoke them as part of its reasoning.

### What Happens During a Task Run

1. **Tool Detection** — The executor checks if the agent has any `mcp:` tools enabled
2. **Server Connection** — For each configured MCP server, the task runner establishes a connection using the appropriate transport (HTTP, SSE, or stdio)
3. **Tool Discovery** — Calls `tools/list` on each connected server to get available tool definitions (name, description, input schema)
4. **Schema Injection** — Discovered MCP tool definitions are merged into the LLM's function calling schema alongside built-in tools
5. **Autonomous Execution** — When the LLM decides to call an MCP tool, the task runner routes the call through `callMcpTool()` with the tool name and arguments
6. **Result Processing** — Tool results flow back into the agent's context, informing the next reasoning step
7. **Cleanup** — All MCP client connections are disconnected after the task completes

<Tip>Agents don't need special configuration to use MCP tools during execution. Just enable the `mcp:` tools on the agent and the task runner handles connection, discovery, execution, and cleanup automatically.</Tip>

### Example: Agent Using GitHub MCP Tools

```
Agent: "I need to check the latest issues in the crewform repo"
  ↓
LLM decides to call: mcp:github/list_issues
  ↓
Task Runner → mcpClient.callMcpTool("github", "list_issues", { repo: "crewform/crewform" })
  ↓
MCP Server (GitHub) returns issue data
  ↓
Agent receives results and continues reasoning
```

## Supported Transports

| Transport | Description | Use Case |
|---|---|---|
| `streamable-http` | HTTP-based streaming (default) | Cloud-hosted MCP servers |
| `sse` | Server-Sent Events | Real-time streaming servers |
| `stdio` | Standard I/O | Local process-based servers |

## Adding an MCP Server

1. Go to **Settings → MCP Servers**
2. Click **Add Server**
3. Fill in:
   - **Name** — Display name (e.g. "GitHub Tools")
   - **URL** — Server URL or command (e.g. `https://mcp.example.com`)
   - **Transport** — `streamable-http`, `sse`, or `stdio`
   - **Config** (optional) — JSON object with auth headers, env vars, or command arguments
4. Click **Save** — CrewForm discovers and caches available tools

### Config Examples

**HTTP server with auth:**
```json
{
  "headers": {
    "Authorization": "Bearer your-token"
  }
}
```

**stdio server with env vars:**
```json
{
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-github"],
  "env": {
    "GITHUB_TOKEN": "ghp_xxx"
  }
}
```

## Enabling MCP Tools on Agents

1. Open the agent's configuration
2. In the **Tools** section, you'll see discovered MCP tools listed as `mcp:server-name/tool-name`
3. Toggle the tools you want the agent to use
4. Save — the agent can now use those tools autonomously during task execution

## Tool Discovery

When you add or refresh an MCP server, CrewForm:

1. Connects to the server using the configured transport
2. Calls the `tools/list` method to discover available tools
3. Caches the tool definitions (name, description, input schema)
4. Makes them available in the agent configuration UI

Cached tools are refreshed automatically when the server configuration changes. You can also manually refresh from the settings panel.

## Popular MCP Servers

| Server | Description |
|---|---|
| `@modelcontextprotocol/server-github` | GitHub repos, issues, PRs |
| `@modelcontextprotocol/server-filesystem` | Local file system access |
| `@modelcontextprotocol/server-postgres` | PostgreSQL queries |
| `@modelcontextprotocol/server-brave-search` | Brave web search |
| `@modelcontextprotocol/server-slack` | Slack messaging |

Browse more at [github.com/modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers).

## Database

MCP servers are stored in the `mcp_servers` table with workspace-scoped RLS. Each server record includes:
- Connection config (URL, transport, auth)
- Cached tool definitions
- Enabled/disabled status

## MCP Server Publishing

CrewForm can also act as an MCP **Server** — exposing your agents as tools that Claude Desktop, Cursor, and other MCP clients can call. This makes CrewForm a **full bidirectional MCP participant**: consuming external tools and publishing agents as tools.

<Card title="MCP Server Publishing" icon="server" href="/mcp-server-publishing">
  Learn how to expose your agents as MCP tools for external clients.
</Card>

