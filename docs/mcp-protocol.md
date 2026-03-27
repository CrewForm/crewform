---
title: 'MCP Protocol'
description: 'Connect agents to thousands of external tool servers via the Model Context Protocol'
---

## Overview

CrewForm supports the **MCP (Model Context Protocol)** — the open standard for connecting AI agents to external tool servers. MCP lets your agents discover and use tools from any MCP-compatible server, expanding their capabilities beyond CrewForm's built-in tools.

<Info>MCP is one of three agentic protocols CrewForm supports, alongside A2A (agent-to-agent) and AG-UI (agent-to-frontend).</Info>

## How It Works

```
Agent Task  →  Task Runner  →  MCP Client  →  External MCP Server
                                    ↓
                              Tool Discovery
                              Tool Execution
```

1. You register MCP servers in **Settings → MCP Servers**
2. CrewForm's task runner connects and discovers available tools
3. Agents with `mcp:` tools enabled can call any discovered tool during execution
4. Tool results flow back into the agent's reasoning loop

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
4. Save — the agent can now use those tools during task execution

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
