---
title: "CLI Tool"
description: "Run CrewForm agents from the command line — scriptable, CI/CD-friendly, Ollama-first."
icon: "terminal"
---

The CrewForm CLI (`npx crewform`) is a standalone command-line tool that lets you create, run, and manage AI agents locally — with optional connectivity to the CrewForm platform.

## Installation

```bash
# Use directly (zero install)
npx crewform

# Or install globally
npm install -g crewform
```

## Quick Start

```bash
# 1. Create an agent config
npx crewform init

# 2. Run it (defaults to Ollama; set OPENAI_API_KEY for OpenAI, etc.)
npx crewform run agent.json "Summarise the latest AI news"

# 3. Interactive chat
npx crewform chat agent.json
```

## Commands

### Local Execution

| Command | Description |
|---------|-------------|
| `crewform run <file> [prompt]` | Run an agent or team from a JSON config |
| `crewform chat <file>` | Interactive chat session with an agent |
| `crewform init` | Create a starter agent or team config |
| `crewform validate <file>` | Validate a config file |
| `crewform tools` | List available built-in tools |

### Platform (API-Connected)

| Command | Description |
|---------|-------------|
| `crewform login` | Authenticate with your CrewForm API key |
| `crewform logout` | Remove saved credentials |
| `crewform whoami` | Show authenticated user & workspace |
| `crewform agents` | List agents in your workspace |
| `crewform teams` | List teams in your workspace |
| `crewform pull <id>` | Download agent/team config to local JSON |
| `crewform push <id> [prompt]` | Dispatch a task to a remote agent/team |

## Running Agents

### Basic Usage

```bash
crewform run agent.json "Write a blog post about MCP"
```

### Input & Output

```bash
# Read prompt from a file
crewform run agent.json --input prompt.txt

# Save output to a file
crewform run agent.json "Generate a report" --output report.md

# Pipe input/output (CI/CD friendly)
echo "Review this code" | crewform run agent.json
crewform run agent.json "Summarise" > summary.txt

# JSON output with token usage and metadata
crewform run agent.json "Hello" --json

# Quiet mode (suppress streaming, show only final result)
crewform run agent.json "Hello" --quiet
```

## Interactive Chat

Start a REPL session with conversation history:

```bash
crewform chat agent.json
```

**In-chat commands:**

| Command | Action |
|---------|--------|
| `/clear` | Clear conversation history |
| `/history` | Show recent messages |
| `/stats` | Show token usage & cost estimate |
| `/exit` | End session |

## Pipeline Teams

Run multi-agent workflows locally. Agents execute in sequence, with each step's output passed as context to the next.

```bash
# Create a team config
crewform init --team

# Run it
crewform run team.json "Research and write about GraphQL best practices"
```

### Team Config Example

```json
{
  "name": "Research & Write Team",
  "mode": "pipeline",
  "agents": [
    {
      "ref_id": "researcher",
      "role": "researcher",
      "agent": {
        "name": "Researcher",
        "model": "gpt-4o",
        "system_prompt": "You are a thorough research agent...",
        "temperature": 0.3,
        "tools": ["web_search"]
      }
    },
    {
      "ref_id": "writer",
      "role": "writer",
      "agent": {
        "name": "Writer",
        "model": "gpt-4o",
        "system_prompt": "You are an expert technical writer...",
        "temperature": 0.7,
        "tools": []
      }
    }
  ],
  "config": {
    "steps": [
      {
        "step_name": "Research",
        "agent_ref": "researcher",
        "instructions": "Research the given topic thoroughly",
        "expected_output": "Comprehensive research notes with sources",
        "on_failure": "stop",
        "max_retries": 1
      },
      {
        "step_name": "Write",
        "agent_ref": "writer",
        "instructions": "Write a polished article from the research",
        "expected_output": "A well-structured blog post",
        "on_failure": "stop",
        "max_retries": 0
      }
    ]
  }
}
```

### Fan-Out (Parallel Execution)

Steps with `type: "fan_out"` run multiple agents in parallel, then merge results:

```json
{
  "step_name": "Parallel Research",
  "type": "fan_out",
  "parallel_agents": ["researcher-1", "researcher-2", "researcher-3"],
  "merge_agent_ref": "synthesiser",
  "merge_instructions": "Combine all research into a single report",
  "fan_out_failure": "continue_on_partial"
}
```

**Failure modes:**
- `fail_fast` — Stop all branches if any fails
- `continue_on_partial` — Collect results from successful branches

## MCP Server Integration

Connect agents to external [MCP](/mcp-protocol) servers for dynamic tool discovery:

```bash
crewform run agent.json --mcp mcp-servers.json "What tables are in my database?"
```

### MCP Server Config

Create a `mcp-servers.json` file:

```json
[
  {
    "name": "postgres",
    "transport": "stdio",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-postgres", "postgresql://localhost/mydb"]
  },
  {
    "name": "filesystem",
    "transport": "stdio",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/files"]
  },
  {
    "name": "remote-tools",
    "transport": "streamable-http",
    "url": "https://mcp.example.com/sse"
  }
]
```

**Supported transports:** `stdio`, `sse`, `streamable-http`

## Platform Integration

Connect the CLI to your CrewForm workspace to browse, download, and dispatch agents remotely.

### Authenticate

Get your API key from **Settings → API Keys** in the [CrewForm dashboard](https://app.crewform.tech).

```bash
# Interactive — prompts for your API key
crewform login

# Non-interactive (CI/CD)
crewform login --api-key cf_sk_abc123

# Self-hosted instance
crewform login --api-key cf_sk_abc123 --api-url https://my-instance.example.com
```

Credentials are saved to `~/.crewform/config.json`.

### Browse Your Workspace

```bash
crewform whoami      # Show user, workspace, plan
crewform agents      # List agents (name, model, ID)
crewform teams       # List teams (mode, member count, ID)

# JSON output for scripting
crewform agents --json | jq '.items[].name'
```

### Download Agents Locally

Pull an agent or team from the platform and run it locally:

```bash
# Download agent
crewform pull <agent-uuid>
crewform run my-agent.json "Hello"

# Download team
crewform pull <team-uuid> --type team
crewform run my-pipeline.json "Research AI trends"
```

### Dispatch Work Remotely

Send a task to a cloud-hosted agent or team without running locally:

```bash
# Dispatch to an agent
crewform push <agent-uuid> "Write a quarterly report"

# Dispatch to a team and wait for completion
crewform push <team-uuid> --type team --wait "Research and summarise AI trends"

# JSON output for CI/CD
crewform push <agent-uuid> "Generate report" --json
```

## Config Formats

The CLI accepts three config formats:

<AccordionGroup>
  <Accordion title="Inline Agent (simplest)">
    ```json
    {
      "name": "My Agent",
      "model": "llama3.3",
      "system_prompt": "You are a helpful assistant.",
      "temperature": 0.7,
      "tools": ["web_search"]
    }
    ```
  </Accordion>

  <Accordion title="CrewForm Export (from the web app)">
    Exported via **Agent → Menu → Export** in the dashboard:
    ```json
    {
      "format": "crewform-export",
      "version": 1,
      "type": "agent",
      "data": {
        "name": "My Agent",
        "model": "gpt-4o",
        "system_prompt": "...",
        "temperature": 0.7,
        "tools": ["web_search"]
      }
    }
    ```
  </Accordion>

  <Accordion title="Team Config">
    See the [Pipeline Teams](#pipeline-teams) section above for the full team config format.
  </Accordion>
</AccordionGroup>

## Built-in Tools

| Tool | Description | Requires |
|------|-------------|----------|
| `web_search` | Search the web via Serper API | `SERPER_API_KEY` |
| `http_request` | Make HTTP GET/POST requests | — |
| `code_interpreter` | Run JavaScript code in a sandbox | — |
| `read_file` | Read a file from a URL | — |
| `grammar_check` | Check grammar and spelling | — |

Plus any tools discovered from connected MCP servers.

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `CREWFORM_API_KEY` | API key for platform commands (alternative to `crewform login`) |
| `CREWFORM_API_URL` | Custom API URL for self-hosted instances |
| `SERPER_API_KEY` | Required for `web_search` tool |
| `OPENAI_API_KEY` | OpenAI provider |
| `ANTHROPIC_API_KEY` | Anthropic provider |
| `GOOGLE_API_KEY` | Google Gemini provider |

See the [CLI README](https://github.com/CrewForm/crewform/blob/main/cli/README.md) for the full list of supported providers and their environment variables.

## CI/CD Integration

The CLI is designed for automation:

```bash
# Install globally in CI
npm install -g crewform

# Run with JSON output for parsing
OPENAI_API_KEY=${{ secrets.OPENAI_KEY }} \
  crewform run agent.json "Review this PR" --json > review.json

# Dispatch to cloud and wait
CREWFORM_API_KEY=${{ secrets.CREWFORM_KEY }} \
  crewform push $AGENT_ID --wait --json "Generate release notes" > notes.json
```
