# Changelog

All notable changes to CrewForm will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
- **Messaging Channels** — Trigger agents from Discord (slash commands), Slack, Telegram, and Email
- **Output Routes** — Deliver results to Discord, Slack, webhooks, MS Teams, Asana, and Email
- **Zapier Integration** — Connect CrewForm to 7,000+ apps with triggers and actions
- **Real-Time Execution** — Live task execution updates via Supabase Realtime
- **Usage Tracking** — Monitor token usage, costs, and performance per agent and task
- **Self-Hosting** — Docker Compose deployment for production
- **AES-256-GCM Encryption** — Secure API key storage
- **Row-Level Security** — Workspace-scoped data isolation via Supabase RLS
- **REST API** — Full CRUD via Supabase Edge Functions with API key authentication
- **Mintlify Docs** — Documentation site at docs.crewform.tech
- **Landing Page** — Marketing site with provider/integration marquees, feature grid, and pricing
