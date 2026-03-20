# Changelog

All notable changes to CrewForm will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
