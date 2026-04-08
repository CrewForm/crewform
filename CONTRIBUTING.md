# Contributing to CrewForm

First off, thank you for considering contributing to CrewForm! It's people like you that make CrewForm such a great open-source tool. We welcome contributions from everyone.

## Code of Conduct

By participating in this project, you are expected to uphold standard open-source community guidelines. Please treat all maintainers and contributors with respect and professionalism.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the existing GitHub issues as you might find that it has already been reported. When creating a bug report, please include as many details as possible:

*   Use a clear and descriptive title.
*   Describe the exact steps to reproduce the problem.
*   Provide specific examples, logs, or screenshots to demonstrate the issue.
*   Include your environment details (OS, Node version, browser, etc.).

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, please:

*   Use a clear and descriptive title.
*   Provide a step-by-step description of the suggested enhancement.
*   Explain why this enhancement would be useful to most CrewForm users and how it aligns with the project goals.

### Pull Requests

1.  Fork the repo and create your branch from `main`.
2.  If you've added code that should be tested, add tests.
3.  If you've changed APIs, update the documentation.
4.  Ensure the test suite passes and your code lints correctly.
5.  Make sure your PR description clearly describes the problem and solution. Include the relevant issue number if applicable.

## Development Setup

To set up the project locally for development:

1.  **Fork and clone** the repository to your local machine:
    ```bash
    git clone https://github.com/YOUR_USERNAME/crewform.git
    cd crewform
    ```

2.  **Install dependencies** (for both frontend and the task runner):
    ```bash
    npm install
    cd task-runner && npm install && cd ..
    ```

3.  **Environment Variables**:
    Copy `.env.example` to `.env.local` for the frontend and configure the required Supabase credentials and API keys. Do the same for `task-runner` if applicable.

4.  **Start the development servers**:
    ```bash
    # Start the frontend
    npm run dev
    
    # In a separate terminal, start the task runner:
    npm run task-runner:dev # or the relevant start command
    ```

## Project Structure

*   `src/`: Frontend React application built with Vite, Tailwind CSS, and ShadCN UI.
*   `ee/`: Enterprise Edition proprietary code (license validation, feature flags). **Requires CLA.**
*   `task-runner/`: Node.js backend execution engine.
*   `supabase/`: Database schema, migrations, and edge functions.
*   `crewform-docs/`: Project documentation and ROADMAP.
*   `docs/`: Mintlify-powered documentation site.
*   `docker/`: Docker compose and nginx configs for self-hosting.
*   `zapier-app/`: Zapier integration app.
*   `scripts/`: Migration and utility scripts.
*   `e2e/`: End-to-end tests (Playwright).

## Architecture Overview

CrewForm follows a **frontend + serverless backend + standalone task runner** architecture:

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (Vite/React)                     │
│                    src/ → app.crewform.tech                   │
└────────────────────────┬────────────────────────────────────┘
                         │ Supabase Client SDK
┌────────────────────────▼────────────────────────────────────┐
│              Supabase (Backend-as-a-Service)                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────┐  │
│  │ Auth     │ │ Database │ │ Realtime │ │ Edge Functions│  │
│  │ (GoTrue) │ │ (Pg+RLS) │ │ (WS)    │ │ (Deno)       │  │
│  └──────────┘ └──────────┘ └──────────┘ └───────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │ Realtime subscription (tasks table)
┌────────────────────────▼────────────────────────────────────┐
│                  Task Runner (Node.js)                        │
│  ┌─────────────┐ ┌──────────────┐ ┌──────────────────────┐  │
│  │ LLM Clients │ │ Tool Executor│ │ Protocol Servers     │  │
│  │ (16 provs)  │ │ (MCP, A2A,  │ │ (MCP, A2A, AG-UI)   │  │
│  │             │ │  KB search)  │ │                      │  │
│  └─────────────┘ └──────────────┘ └──────────────────────┘  │
│  ┌─────────────┐ ┌──────────────┐ ┌──────────────────────┐  │
│  │ Tracing     │ │ Channel      │ │ Output Route         │  │
│  │ (Langfuse/  │ │ Handlers     │ │ Dispatcher           │  │
│  │  OTLP)      │ │ (Slack, etc) │ │ (Webhook, Slack...)  │  │
│  └─────────────┘ └──────────────┘ └──────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Location | Role |
|-----------|----------|------|
| **Frontend** | `src/` | React SPA — agent builder, team canvas, task management, settings UI |
| **Supabase Auth** | Managed | User authentication, session management, workspace isolation |
| **PostgreSQL + RLS** | `supabase/migrations/` | All data storage with Row-Level Security for workspace isolation |
| **pgvector** | Extension | Vector embeddings for knowledge base search and team memory |
| **Edge Functions** | `supabase/functions/` | MCP discovery, Zapier webhook, marketplace sync |
| **Task Runner** | `task-runner/src/` | LLM execution, tool calling, protocol servers, tracing, channel handlers |
| **Nginx** | `docker/nginx.conf` | Reverse proxy for self-hosted deployments |

### Task Execution Flow

When a user creates a task:

1. **Frontend** inserts a row in `tasks` table with status `pending`
2. **Task Runner** detects it via Supabase Realtime subscription
3. Runner loads the agent config (model, prompt, tools, knowledge base)
4. Runner calls the appropriate **LLM client** (OpenAI, Anthropic, etc.)
5. If the LLM requests tool use, the **Tool Executor** handles it:
   - `mcp_tool_*` → MCP Client execution
   - `a2a_delegate` → A2A Client delegation
   - `knowledge_search` → pgvector similarity search
   - `web_search`, `calculator`, etc. → built-in tools
6. Runner updates the task with the result and status `completed`
7. **Output Route Dispatcher** sends results to configured destinations

### Agent Execution Modes

| Mode | Description | Key Files |
|------|-------------|-----------|
| **Single Task** | One agent, one task | `task-runner/src/taskRunner.ts` |
| **Pipeline** | Sequential agent chain — output flows to the next agent | `task-runner/src/pipelineRunner.ts` |
| **Orchestrator** | Brain agent delegates sub-tasks to worker agents dynamically | `task-runner/src/orchestratorRunner.ts` |
| **Collaboration** | Agents discuss in rounds, building on each other's responses | `task-runner/src/collaborationRunner.ts` |
| **Fan-Out** | Parallel branching — multiple agents run simultaneously, merge agent combines | Part of pipeline runner |

### Key Files for Contributors

| Area | Files |
|------|-------|
| Adding an LLM provider | `task-runner/src/llmClients/` |
| Adding a built-in tool | `task-runner/src/tools/`, `task-runner/src/toolExecutor.ts` |
| Adding an output route | `task-runner/src/outputRouteDispatcher.ts`, `src/components/settings/` |
| Adding a messaging channel | `task-runner/src/channels/`, `supabase/functions/` |
| Database schema changes | `supabase/migrations/` (create a new numbered file) |
| UI components | `src/components/` (ShadCN + Tailwind) |
| Tracing/observability | `task-runner/src/tracing.ts` |

## Coding Standards

*   **TypeScript**: Use strictly typed TypeScript. Avoid using `any` wherever possible.
*   **Linting & Formatting**: We use ESLint and Prettier. Ensure your code passes all lint checks (`npm run lint`).
*   **Components**: Follow the established React functional component patterns in `src/components`, keeping components modular and utilizing specialized hooks in `src/hooks`.

## Community Edition vs Enterprise Edition

CrewForm uses a dual-license (open-core) model:

*   **Community Edition** (everything outside `ee/`)  — Licensed under AGPL-3.0. Contributions welcome!
*   **Enterprise Edition** (inside `ee/`)  — Proprietary. Contributions require a signed **Contributor License Agreement (CLA)**.

If you're unsure whether your change touches EE code, just open an issue or PR and we'll guide you.

## License

By contributing to Community Edition code (outside `ee/`), you agree that your contributions will be licensed under the project's [GNU Affero General Public License v3.0 (AGPL v3)](LICENSE).

Contributions to Enterprise Edition code (inside `ee/`) require a signed Contributor License Agreement. Contact team@crewform.tech for details.
