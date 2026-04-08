# Changelog

All notable changes to CrewForm will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [1.8.0] - 2026-04-08

### Added

- **Embeddable Chat Widget** — Drop-in `<script>` tag to embed any CrewForm agent as a floating chat widget on any website:
  - Standalone Vite build outputs `widget.js` bundle served at `/chat/widget.js`
  - Customizable position, theme colors, and welcome message via `data-*` attributes
  - Domain whitelisting via `cf_chat_` API keys for production security
  - Settings UI with embed snippet generator, API key management, and live preview
  - Chat history stored in `chat_sessions` / `chat_messages` tables (Migration `071`)
  - Built and bundled inside the task runner Docker image for zero-config deployment
- **Knowledge Base Enhancements** — Upgraded KB from basic vector search to production-grade retrieval:
  - **Retrieval Testing UI** — Interactive playground to query uploaded documents, see matched chunks with color-coded similarity scores, toggle between search modes, and filter by document or tag
  - **Metadata Tag Filtering** — Tag documents with labels (e.g., "FAQ", "Technical") and filter search results by tags. Inline tag editor on each document row with GIN-indexed tag queries
  - **Hybrid Search + Reranking** — Combines vector similarity (cosine) with PostgreSQL full-text search (`ts_rank_cd`), weighted scoring (default 70% vector / 30% text), and over-fetch + rerank strategy for better recall
  - New `POST /kb/search` endpoint for direct retrieval without task execution
  - Migration `072`: `tags` column, `tsvector` generated column, GIN indexes, `hybrid_search_knowledge` RPC
- **Agent/Team Export & Import** — Portable JSON data format for sharing agent and team configurations:
  - **Export Agent** — One-click download of agent config (model, prompt, tools, voice profile) as `crewform-agent-{name}.json`
  - **Export Team** — Self-contained JSON with all member agents embedded inline, preserving pipeline/orchestrator/collaboration config
  - **Import** — Upload any export file to create agents/teams with `(imported)` suffix; team imports rewrite all agent ID references to maintain referential integrity
  - Export buttons on Agent Detail and Team Detail pages; Import button on Agents list
  - Versioned `crewform-export` format (v1) for forward compatibility
- **AG-UI Rich Interactions** — Agents can now pause execution and request user input via three interaction types:
  - **Approval** — Agent asks for permission before proceeding (Approve / Reject buttons)
  - **Data Confirmation** — Agent presents data for user to verify or edit before continuing
  - **Choice Selection** — Agent presents options for the user to pick from
  - New `INTERACTION_REQUEST`, `INTERACTION_RESPONSE`, and `INTERACTION_TIMEOUT` AG-UI event types
  - New `POST /ag-ui/:agentId/respond` endpoint for submitting interaction responses
  - Executor helper functions: `requestApproval()`, `requestDataConfirmation()`, `requestChoice()`
  - `InteractionModal` component with glassmorphism styling, countdown timer, and slide-up animation
  - `useAgentStream` hook now exposes `pendingInteraction` state and `respond()` callback
  - Tasks transition to `waiting_for_input` status while awaiting user response (5-minute default timeout)
  - Migration `069`: `waiting_for_input` task status + `interaction_context` JSONB column
- **Marketplace Agent README** — Agents can now include rich Markdown documentation visible to potential users:
  - New `marketplace_readme` field on the Agent model (Migration `070`)
  - Markdown textarea with live preview in the Publish Agent modal
  - README section with formatted rendering in the Agent Detail modal
- **License Key Validation** — EE license keys are now cryptographically verified:
  - HMAC-SHA256 signature verification on task runner startup (when `CREWFORM_LICENSE_SECRET` is set)
  - New `validate-license` Edge Function for on-demand key verification
  - 24-hour periodic re-validation with 7-day offline grace period
  - Validation status display (last validated, stale indicator) in the License Admin panel
  - Invalid/forged keys are automatically marked as `invalid` in the database
- **Observability & Tracing** — Opt-in OpenTelemetry + Langfuse integration for production debugging of multi-agent workflows:
  - New `tracing.ts` module with zero-overhead lazy initialization (only loads SDKs when env vars are set)
  - **Langfuse** support — LLM calls appear as Generations with model, token counts, cost, and prompt/output previews
  - **Generic OTLP** support — works with Datadog, Jaeger, Grafana Tempo, and any OTLP-compatible backend
  - Task execution traces with spans for MCP discovery, LLM calls, and tool invocations
  - Team run traces with child spans for pipeline/orchestrator/collaboration execution
  - Env vars: `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `OTEL_EXPORTER_OTLP_ENDPOINT`

### Changed

- **AG-UI Protocol Version** — Health endpoint now reports version `1.1` (up from `1.0`)

### Documentation

- **MCP Protocol** — Expanded docs to clearly document **MCP Client Execution** — agents autonomously invoke external MCP server tools during task runs via `callMcpTool()`. Added architecture diagram, runtime execution lifecycle (8-step flow), and example usage
- **Observability** — New doc page covering Langfuse and OTLP setup, trace structure for tasks and team runs, environment variables, and Docker/self-hosted configuration
- **API Reference** — Added AG-UI Protocol endpoints section (`POST /ag-ui/:agentId/sse`, `POST /ag-ui/:agentId/respond`, `GET /ag-ui/health`), added `waiting_for_input` to task statuses
- **Agents Guide** — Added MCP Server Publishing section (publish toggle, tool name mapping, config snippet, client setup)
- **Visual Workflow Builder** — Added Fan-Out Visualization section (fan-out/branch/merge node types, branching pattern, per-branch execution states)
- **AG-UI Protocol** — Added Rich Interactions section (interaction types, `/respond` endpoint, React hook usage, timeout behavior)

## [1.7.1] - 2026-04-01

### Added

- **MCP Server Publishing** — Expose your CrewForm agents as MCP tools so external clients (Claude Desktop, Cursor, other agent frameworks) can call them
  - New `mcpServer.ts` handler implementing MCP Streamable HTTP transport (`POST /mcp`)
  - Supports `initialize`, `tools/list`, `tools/call`, and `ping` JSON-RPC methods
  - Agents opt-in via `is_mcp_published` flag — each published agent becomes an MCP tool with auto-generated name, description, and input schema
  - Auth via dedicated MCP API keys or existing A2A keys (Bearer token)
  - Tasks created with full audit trail and AG-UI event streaming
- **MCP API Key Generation** — Generate, regenerate, and revoke MCP API keys from the Settings UI
  - One-click key generation with `cf_mcp_` prefix
  - Key shown once with copy button; masked preview afterward
  - Regenerate/Revoke actions with confirmation for key rotation
- **MCP Connection Config** — Auto-generated Claude Desktop / Cursor config snippet with copy button in Settings → MCP Servers
- **Ollama Auto-Discovery** — Dynamically detect installed Ollama models via `GET /api/tags` and merge them into the model selector
- **Custom Base URL** — Per-provider base URL field for Ollama (and future providers), enabling remote Ollama instances on different hosts
- **MCP Publish Toggle** — "MCP Publish" / "MCP Published" button on each agent's detail page to opt-in/opt-out of MCP exposure

### Changed

- LLM providers updated from 15 to 16 (Ollama with auto-discovery)
- Task runner now dynamically resolves Ollama base URLs from the API key record instead of hardcoded localhost

## [1.6.0] - 2026-04-01

### Added

- **Fan-Out Pipelines** — Pipeline steps can now branch into multiple agents running in parallel, with configurable merge agent and failure modes (`fail_fast` / `continue_on_partial`)
- **Fan-Out Config UI** — New "Add Fan-Out" button in pipeline config panel with multi-agent checklist, merge agent selector, merge instructions, and branch failure mode
- **Fan-Out Canvas Visualization** — Workflow canvas renders fan-out steps as branching nodes with amber-colored edges and merge points
- **Fan-Out Progress Rail** — Real-time execution rail shows parallel branch status indicators per agent
- **Visual Builder Phase 2** — Glassmorphism node styling, live transcript panel, keyboard shortcuts, and tool usage heatmap
- **Multi-Directional Handles** — Canvas supports both top-to-bottom and left-to-right layout directions with correct edge handle switching
- **Pipeline Step Insertion** — Right-click any edge on the canvas to insert a new agent step between existing steps
- **README Comparison Table** — "How CrewForm Compares" section with 11-row feature comparison (CrewForm vs alternatives)
- **README Hero GIF** — Animated pipeline run GIF as README hero image

### Fixed

- **Fan-Out Canvas Roundtrip** — Canvas changes no longer destroy fan-out configuration; graph-to-config reverse mapping correctly groups fan-out branch/merge nodes
- **Edge Handle Persistence** — Edge handles now persist correctly when switching between TB/LR layout directions
- **Edge Handle Direction** — Edges connect to correct side handles based on layout direction

### Changed

- Updated LLM provider count from 15 to 16 (Moonshot added)
- Pipeline validation now skips `agent_id` check for fan-out steps

## [1.5.0] - 2026-03-27

### Added

- **Model Performance Comparison** — New analytics chart comparing models by speed, cost/run, and tokens/run with inline mini-bars
- **Marketplace Category Filters** — Preset category groups (Customer Support, Content Creation, Data Analysis, Code Assistant, Research, Sales & Marketing, DevOps, Education) for browsing marketplace agents
- **Marketplace Category Query** — Category filter plumbed through to Supabase query layer for server-side filtering

## [1.4.1] - 2026-03-27

### Added

- **Canvas Undo/Redo** — Full undo/redo support with `Ctrl+Z` / `Ctrl+Shift+Z` keyboard shortcuts and toolbar buttons (30-entry history stack)
- **Canvas Auto-Layout** — One-click dagre-based graph layout via toolbar button (TB for pipeline/orchestrator, LR for collaboration)
- **Canvas Position Persistence** — Node positions saved to `teams.config` JSONB and restored on reload — no DB migration needed
- **Per-Task Token Breakdown** — Prompt vs completion token split persisted per agent; stacked bar chart on Analytics page
- **Cost Forecasting** — 30-day cost projection using linear regression with trend indicator, daily average, and mini forecast chart

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
