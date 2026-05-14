# CrewForm CLI

Run CrewForm AI agents from the command line — scriptable, CI/CD-friendly, Ollama-first.

```
npx crewform run agent.json "Summarise the latest AI news"
```

## Quick Start

```bash
# 1. Create an agent config
npx crewform init

# 2. Run it (Ollama, or set OPENAI_API_KEY / ANTHROPIC_API_KEY)
npx crewform run agent.json "Hello, world!"

# 3. Interactive chat
npx crewform chat agent.json
```

## Installation

```bash
# Use directly (no install needed)
npx crewform

# Or install globally
npm install -g crewform
```

## Commands

### Local Execution

| Command | Description |
|---------|-------------|
| `crewform run <file> [prompt]` | Run an agent or team from a JSON config |
| `crewform chat <file>` | Interactive chat session |
| `crewform init` | Create a starter config file |
| `crewform validate <file>` | Validate a config file |
| `crewform tools` | List available built-in tools |

### Platform (API-Connected)

| Command | Description |
|---------|-------------|
| `crewform login` | Authenticate with your API key |
| `crewform logout` | Remove saved credentials |
| `crewform whoami` | Show authenticated user & workspace |
| `crewform agents` | List agents in your workspace |
| `crewform teams` | List teams in your workspace |
| `crewform pull <id>` | Download agent/team config to local JSON |
| `crewform push <id> [prompt]` | Dispatch a task to a remote agent/team |

### `crewform run`

```bash
# Basic usage
crewform run agent.json "Write a blog post about MCP"

# Read prompt from file
crewform run agent.json --input prompt.txt

# Save output to file
crewform run agent.json "Generate a report" --output report.md

# Pipe input/output
echo "Review this code" | crewform run agent.json
crewform run agent.json "Summarise" > summary.txt

# JSON output with metadata
crewform run agent.json "Hello" --json

# Quiet mode (no streaming, just result)
crewform run agent.json "Hello" --quiet

# Run a pipeline team
crewform run team.json "Research and write about GraphQL"

# Run with MCP servers
crewform run agent.json --mcp mcp-servers.json "Query my database"
```

### `crewform chat`

Interactive REPL with conversation history:

```bash
crewform chat agent.json
```

**Commands in chat:**
- `/clear` — Clear conversation history
- `/history` — Show recent messages
- `/stats` — Show token usage & cost
- `/exit` — End session

### `crewform init`

```bash
# Create agent config
crewform init

# Create pipeline team config
crewform init --team

# Custom name and model
crewform init --name "Code Reviewer" --model gpt-4o
```

## Config Format

### Inline Agent (simplest)

```json
{
  "name": "My Agent",
  "model": "llama3.3",
  "system_prompt": "You are a helpful assistant.",
  "temperature": 0.7,
  "tools": ["web_search"]
}
```

### CrewForm Export (from the web app)

The CLI also accepts the full `crewform-export` v1 format that you get when exporting an agent from the CrewForm web app.

## Supported Providers

The CLI supports **16 LLM providers** out of the box:

| Provider | Env Variable | Notes |
|----------|-------------|-------|
| **Ollama** | (none needed) | Default, auto-detected |
| **OpenAI** | `OPENAI_API_KEY` | GPT-4o, o3, etc. |
| **Anthropic** | `ANTHROPIC_API_KEY` | Claude 4, etc. |
| **Google** | `GOOGLE_API_KEY` | Gemini 2.x |
| **OpenRouter** | `OPENROUTER_API_KEY` | 200+ models |
| **Groq** | `GROQ_API_KEY` | Fast inference |
| **Mistral** | `MISTRAL_API_KEY` | Codestral, etc. |
| **Cohere** | `COHERE_API_KEY` | Command R+ |
| **Together** | `TOGETHER_API_KEY` | Open-source models |
| **NVIDIA** | `NVIDIA_API_KEY` | NIM models |
| **HuggingFace** | `HF_TOKEN` | Inference API |
| **Venice** | `VENICE_API_KEY` | Privacy-first |
| **MiniMax** | `MINIMAX_API_KEY` | |
| **Moonshot** | `MOONSHOT_API_KEY` | |
| **Perplexity** | `PERPLEXITY_API_KEY` | Sonar models |

## Available Tools

| Tool | Description | Requires |
|------|-------------|----------|
| `web_search` | Search the web via Serper | `SERPER_API_KEY` |
| `http_request` | Make HTTP requests | — |
| `code_interpreter` | Run JavaScript in sandbox | — |
| `read_file` | Read file from URL | — |
| `grammar_check` | Check grammar/spelling | — |

## MCP Server Support

Connect to MCP (Model Context Protocol) servers to give agents access to external tools:

```bash
crewform run agent.json --mcp mcp-servers.json "What tables are in my DB?"
```

**mcp-servers.json:**
```json
[
  {
    "name": "my-db",
    "transport": "stdio",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-postgres", "postgresql://..."]
  }
]
```

Supported transports: `stdio`, `sse`, `streamable-http`.

## Platform Integration

Connect to the CrewForm web platform to manage agents remotely:

```bash
# Authenticate (get your API key from Settings → API Keys)
crewform login

# Browse your workspace
crewform agents
crewform teams

# Download an agent to run locally
crewform pull abc-123-uuid
crewform run my-agent.json "Hello"

# Dispatch work to a cloud agent/team
crewform push abc-123-uuid "Write a report on Q4 metrics"
crewform push abc-123-uuid --type team --wait "Research AI trends"
```

Credentials are saved to `~/.crewform/config.json`. Self-hosted users can set `--api-url`.

## License

AGPL-3.0-or-later · [CrewForm](https://crewform.tech)
