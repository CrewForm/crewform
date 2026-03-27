# Changelog

All notable changes to CrewForm will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.4.0] - 2026-03-27

### Added

- **Visual Workflow Builder — Interactive Editing** — Full Phase 2 canvas editing capabilities:
  - Drag agents from the sidebar onto the canvas to add them to a team
  - Delete agent nodes from the canvas (with brain agent protection in orchestrator mode)
  - Connect nodes by dragging edges to define pipeline execution order
  - Edit step name, instructions, expected output, and on-failure handling inline on the canvas sidebar
  - Auto-save with validation — invalid configs are rejected with rollback and toast notification
- **Canvas Error Boundary** — Any canvas crash automatically switches to Form view with error toast, keeping data safe
- **Draggable Agent Palette** — Sidebar agents show grip handles and are draggable onto the canvas

### Changed

- **Workflow Sidebar** — Pipeline step properties are now editable inputs (text, textarea, select) instead of read-only labels

## [1.3.0] - 2026-03-27

### Added

- **Tier Limits for Knowledge Base** — Free: 3 docs, Pro: 25 docs, Team+: Unlimited. Quota enforced on upload with upgrade prompt
- **Tier Limits for A2A Publishing** — A2A agent publishing gated to Pro+ plans; consuming remains free on all tiers
- **Embedding Provider Fallback** — `kb-process` Edge Function now tries all available providers (OpenAI → OpenRouter) instead of failing on the first quota error
- **README Screenshot Gallery** — Added 6 product screenshots in a collapsible gallery (Dashboard, Agent Creation, Pipeline Setup/Run, Marketplace, A2A Settings)
- **Landing Page Screenshots** — Added "See It In Action" section with 5 product screenshots and hover effects
- **Pricing Table Updates** — Added MCP Protocol, AG-UI Protocol, Knowledge Base, A2A Consume, and A2A Publish rows to both README and in-app pricing table

### Fixed

- **Knowledge Base Upload** — Fixed silent upload failures caused by missing storage RLS policies for the `knowledge` bucket
- **KB Processing Errors** — Replaced fire-and-forget processing with proper error handling; documents no longer get stuck on "pending" — errors surface via toast notifications
- **Edge Function Auth** — Deployed `kb-process` with `--no-verify-jwt` to prevent 401 errors (function handles auth internally)
- **Upload Button Styling** — Fixed upload button text color for brand consistency

### Changed

- **Provider Count** — Updated from 14 to 15 LLM providers (added Ollama)
- **Landing Page Pricing** — Updated tier features with Knowledge Base limits, MCP Protocol, and A2A Publish

## [1.2.0] - 2026-03-27

### Added

- **A2A Protocol Support** — Agent-to-Agent interoperability: publish agent cards (`/.well-known/agent.json`), delegate tasks to external A2A agents via the `a2a_delegate` tool, and manage remote agents in Settings → A2A Protocol
- **AG-UI Protocol Support** — Real-time SSE streaming for frontend integration via `POST /ag-ui/:agentId/sse`, in-process event bus, and React hook (`useAgentStream.ts`) for live agent-to-UI communication
- **RAG / Knowledge Base** — Upload documents (TXT, MD, CSV, JSON), auto-chunk and embed with pgvector, and search via the `knowledge_search` agent tool
- **MCP Tool Discovery** — Browse and discover available tools from connected MCP servers directly in Settings UI
- **Ollama / Local Model Support** — 11 popular local models (Llama 3.3, Qwen 2.5, DeepSeek R1, Mixtral, Phi-4, Gemma 2, etc.) via Ollama — zero API keys, fully local inference
- **Abuse Dashboard** — Spike detection, key rotation alerts, and workspace suspension enforcement in the Super Admin panel
- **Activity Workspace Filter** — Filter the Activity tab by workspace in the Super Admin panel
- **MCP & Knowledge Base Docs** — Added MCP Protocol and Knowledge Base (RAG) documentation pages to Mintlify

### Fixed

- **Task Runner OOM** — Resolved out-of-memory crashes on Railway deployment
- **Realtime Reconnect Loop** — Prevented infinite WebSocket reconnect loop; gracefully disables Realtime after 5 consecutive failures
- **Channel Task Tracking** — Tasks originating from messaging channels (Discord, Slack, Telegram) now correctly update agent activity and analytics
- **MCP Discovery CORS** — Proxied MCP tool discovery through Edge Function to bypass browser CORS restrictions
- **Webhook Server Binding** — Bound webhook server to `0.0.0.0` for Railway/Docker compatibility
- **Mintlify Branding** — Fixed CrewForm logo and favicon on docs site

### Changed

- **README** — Updated with MCP, RAG, A2A, AG-UI, and Ollama features; added self-hosting section with local model instructions
- **Zapier Integration** — Added per-agent and per-team filtering for Zapier triggers and actions
- **Landing Page** — Removed explicit pricing row; updated self-hosting section with Ollama

## [1.1.0] - 2026-03-20

### Added

- **Agent Tool Support for Teams** — Agents in Pipeline, Orchestrator, and Collaboration team modes can now use their configured tools (e.g. web search) during execution
- **Tool Call Tracking** — Tool call logs (arguments, results, duration) are captured and displayed in both Task Detail and Team Run Detail views
- **Change Password** — Users can now change their password in Settings → Profile
- **Execution Mode Tutorials** — Added comprehensive tutorials for all 4 execution modes

### Fixed

- **Realtime Auto-Reconnect** — Task runner now detects dropped WebSocket connections and auto-reconnects with exponential backoff, preventing 4-5 minute delays in team run pickup
- **Docker Build** — Fixed Dockerfile COPY paths for repo-root build context
- **Onboarding Flow** — Fixed invite redirect through email confirmation and onboarding bugs for new users

### Changed

- **Zapier Integration** — Hardcoded production API URL (`api.crewform.tech`), removed user-provided Supabase URL field for security compliance
- **Landing Page** — Updated CTAs from "Join the Beta" to "Get Started Free"

## [0.1.0] - 2026-03-09

### Added

- **Agent Management** — Create, configure, and monitor AI agents from a visual UI with system prompts, model selection, and tools
- **Pipeline Mode** — Chain agents together in sequential workflows with automatic handoffs
- **Orchestrator Mode** — Brain agent coordinates sub-agents via delegation trees *(Pro)*
- **Collaboration Mode** — Agents discuss and debate tasks in real-time conversation threads *(Team)*
- **Single Tasks** — Send a prompt to any agent and get results in real-time
- **Agent Marketplace** — Browse and install community-built agent templates
- **BYOK (Bring Your Own Key)** — Connect your own API keys from 14 providers: OpenAI, Anthropic, Google Gemini, Groq, Mistral, Cohere, NVIDIA NIM, Perplexity, Together, OpenRouter, HuggingFace, MiniMax, Moonshot, Venice
- **Team Memory** — Shared pgvector semantic search across agents *(Team)*
- **RBAC** — Role-based access control and workspace member invitations *(Team)*
- **Messaging Channels** — Trigger agents from Discord (slash commands), Slack, Telegram, Email, and Trello
- **Output Routes** — Deliver results to Discord, Slack, webhooks, MS Teams, Asana, Trello, and Email
- **Zapier Integration** — Connect CrewForm to 7,000+ apps with triggers and actions
- **Real-Time Execution** — Live task execution updates via Supabase Realtime
- **Usage Tracking** — Monitor token usage, costs, and performance per agent and task
- **Self-Hosting** — Docker Compose deployment for production
- **AES-256-GCM Encryption** — Secure API key storage
- **Row-Level Security** — Workspace-scoped data isolation via Supabase RLS
- **REST API** — Full CRUD via Supabase Edge Functions with API key authentication
- **Mintlify Docs** — Documentation site at docs.crewform.tech
- **Landing Page** — Marketing site with provider/integration marquees, feature grid, and pricing
