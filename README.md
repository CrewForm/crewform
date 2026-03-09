<div align="center">

<img src=".github/assets/crewform-banner.png" alt="CrewForm" width="400" />

### Form your AI crew

**AI Orchestration for Everyone**

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![CI](https://github.com/CrewForm/crewform/actions/workflows/ci.yml/badge.svg)](https://github.com/CrewForm/crewform/actions/workflows/ci.yml)
[![Docs](https://img.shields.io/badge/Docs-Mintlify-0D9373?logo=mintlify&logoColor=white)](https://docs.crewform.tech)
[![Discord](https://img.shields.io/discord/1476188192100323488?color=5865F2&label=Discord&logo=discord&logoColor=white)](https://discord.gg/TAFasJCTWs)
[![Zapier](https://img.shields.io/badge/Zapier-Integrated-FF4A00?logo=zapier&logoColor=white)](https://zapier.com)
[![Website](https://img.shields.io/badge/Website-crewform.tech-6bedb9)](https://crewform.tech)

[Website](https://crewform.tech) · [Docs](https://docs.crewform.tech) · [Discord](https://discord.gg/TAFasJCTWs) · [Twitter](https://twitter.com/CrewForm)

</div>

---

## Table of Contents

- [Why CrewForm?](#why-crewform)
- [Key Features](#key-features)
- [Editions & Pricing](#editions--pricing)
- [Quick Start](#quick-start)
- [Documentation](#documentation)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [How CrewForm Compares](#how-crewform-compares)
- [Contributing](#contributing)
- [Community](#community)
- [FAQ](#faq)
- [License](#license)

## Why CrewForm?

Most multi-agent AI platforms today require you to either:

- 💸 Pay a SaaS provider who marks up your LLM costs
- 🔒 Accept vendor lock-in with no self-hosting option
- 🎓 Be a Python expert to set up orchestration from scratch

**CrewForm changes that.** We provide the orchestration layer — the UI, the team management, the monitoring, the marketplace — while you keep full control of your API keys, your data, and your infrastructure.

CrewForm is built for developers and teams who want production-ready AI agent orchestration without the complexity, cost, or lock-in of closed platforms.

## Key Features

### Community Edition (Free & Open Source)

- 🔑 **BYOK (Bring Your Own Key)** — Pay your LLM provider directly. Zero markup, zero middleman
- 🤖 **Agent Management** — Create, configure, and monitor AI agents from a visual UI
- 🏪 **Marketplace** — Browse and install agent templates built by the community
- 👥 **Pipeline Mode** — Chain agents together in sequential workflows
- ✅ **Single Tasks** — Send a prompt to any agent and get results in real-time
- 🏠 **Self-Hostable** — Run on your own infrastructure with Docker Compose
- 🔒 **Secure by Default** — AES-256-GCM key encryption, Row-Level Security, GDPR-ready
- ⚡ **Real-Time** — Watch your agents work in real-time with live task execution updates
- 📊 **Usage Tracking** — Monitor token usage, costs, and performance per agent and task

### Enterprise Edition (Paid Plans)

- 🔗 **Orchestrator Mode** — Brain agent coordinates sub-agents via delegation trees *(Pro)*
- 🛠️ **Custom Tools** — Extend agents with custom tool integrations *(Pro)*
- 💬 **Collaboration Mode** — Agents discuss and debate tasks in real-time threads *(Team)*
- 🧠 **Team Memory** — Shared pgvector semantic search across agents *(Team)*
- 👤 **RBAC** — Role-based access control and workspace member invitations *(Team)*

### Integrations

- ⚡ **Zapier** — Connect CrewForm to 7,000+ apps. Trigger agents from Gmail, Slack, forms, or schedules
- 📡 **Messaging Channels** — Trigger agents from Discord, Slack, Telegram, and Email
- 📤 **Output Routes** — Deliver results to Discord channels, Slack, webhooks, MS Teams, and more
- 📈 **Advanced Analytics** — Charts, CSV export, prompt history with diffs *(Pro)*
- 📋 **Audit Logs** — Full audit trail with Datadog/Splunk streaming *(Enterprise)*
- 🐝 **Swarm** — Multi-runner concurrency pool *(Enterprise)*

## Editions & Pricing

CrewForm uses an **open-core** model: a free Community Edition under AGPL-3.0 and a proprietary Enterprise Edition.

| | Free | Pro | Team | Enterprise |
|---|---|---|---|---|
| **Price** | $0 | $39/mo | $99/mo | Custom |
| Agents | 3 | 25 | Unlimited | Unlimited |
| Tasks/month | 50 | 1,000 | Unlimited | Unlimited |
| Teams | 1 | 10 | Unlimited | Unlimited |
| Members | 1 | 3 | 25 | Unlimited |
| Pipeline Mode | ✅ | ✅ | ✅ | ✅ |
| Orchestrator Mode | — | ✅ | ✅ | ✅ |
| Collaboration Mode | — | — | ✅ | ✅ |
| Team Memory | — | — | ✅ | ✅ |
| Audit Logs | — | — | — | ✅ |
| Self-Hosting | ✅ (CE) | ✅ | ✅ | ✅ |

> See [LICENSING.md](LICENSING.md) for full details on the dual-license model.

## Quick Start

Get up and running in under 5 minutes:

```bash
# Clone the repo
git clone https://github.com/CrewForm/crewform.git
cd crewform

# Install dependencies
npm install

# Set up environment
cp .env.example .env.local

# Start development server
npm run dev
```

> **Self-hosting?** See the [Docker deployment guide](https://docs.crewform.tech/self-hosting) for production setup.

## Documentation

| Guide | Description |
|-------|-------------|
| [Quick Start](https://docs.crewform.tech/quickstart) | Get running in under 5 minutes |
| [Agents Guide](https://docs.crewform.tech/agents) | Models, system prompts, and agent lifecycle |
| [Pipeline Teams](https://docs.crewform.tech/pipeline-teams) | Multi-agent sequential workflows |
| [Orchestration Teams](https://docs.crewform.tech/orchestration-teams) | Brain agent with delegation trees |
| [Collaboration Teams](https://docs.crewform.tech/collaboration-teams) | Multi-agent real-time discussion |
| [Channels](https://docs.crewform.tech/channels) | Discord, Slack, Telegram, Email triggers |
| [Discord Integration](https://docs.crewform.tech/discord-integration) | Slash commands and bot setup |
| [Output Routes](https://docs.crewform.tech/output-routes) | Deliver results to external destinations |
| [API Reference](https://docs.crewform.tech/api-reference) | REST API endpoints and authentication |
| [Self-Hosting](https://docs.crewform.tech/self-hosting) | Docker Compose production deployment |

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   CrewForm UI                    │
│          React + TypeScript + Tailwind           │
├─────────────────────────────────────────────────┤
│          EE Feature Gating (ee/)                 │
│     License Validation · Feature Flags           │
├─────────────────────────────────────────────────┤
│                  Supabase Layer                  │
│     Auth · Database · Realtime · Storage         │
│           Edge Functions (REST API)              │
├─────────────────────────────────────────────────┤
│                  Task Runner                     │
│      Node.js · Multi-Provider LLM Support        │
│     (Anthropic · Google · OpenAI · More)         │
├─────────────────────────────────────────────────┤
│                  Integrations                    │
│   Channels · Output Routes · Zapier · Webhooks   │
├─────────────────────────────────────────────────┤
│              Your LLM Providers                  │
│           (BYOK — Your Keys, Your Cost)          │
└─────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------| 
| **Frontend** | React 18 · TypeScript · Vite · Tailwind CSS · ShadCN UI |
| **State** | TanStack Query · Zustand |
| **Backend** | Supabase (Auth, Database, Realtime, Edge Functions) |
| **Task Runner** | Node.js · Multi-provider LLM integration |
| **Integrations** | Zapier · Discord · Slack · Telegram · Email · Webhooks |
| **Validation** | Zod |
| **Deployment** | Vercel · Docker |

## How CrewForm Compares

CrewForm occupies a unique position: a **UI-first, self-hostable, open-source** multi-agent orchestration platform with zero LLM cost markup.

| Feature | CrewForm | CrewAI | AutoGen | LangGraph | Agency Swarm | Relevance AI | Flowise | n8n AI |
|---------|----------|--------|---------|-----------|--------------|--------------|---------|--------|
| **Open Source** | ✅ AGPL v3 | ✅ MIT | ✅ MIT | ✅ MIT | ✅ MIT | ❌ Proprietary | ✅ Apache | ✅ Sustainable Use |
| **Visual UI** | ✅ Built-in | ✅ Studio | ⚠️ Basic | ❌ Code only | ❌ Code only | ✅ No-code | ✅ Drag-and-drop | ✅ Node-based |
| **Self-Hostable** | ✅ Docker | ⚠️ Enterprise only | ✅ DIY | ⚠️ Via LangSmith | ✅ DIY | ❌ Cloud only | ✅ Docker | ✅ Docker |
| **BYOK (No Markup)** | ✅ | ⚠️ OSS only | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| **Agent Marketplace** | ✅ | ❌ | ❌ | ❌ | ❌ | ⚠️ Pre-built only | ❌ | ❌ |
| **Multi-Agent Orchestration** | ✅ 3 modes | ✅ | ✅ | ✅ | ✅ | ⚠️ Basic | ⚠️ Basic | ❌ |
| **Messaging Channels** | ✅ 4 platforms | ❌ | ❌ | ❌ | ❌ | ⚠️ Slack only | ❌ | ✅ 400+ |
| **Zapier Integration** | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ (built-in) |
| **Output Routes** | ✅ Webhooks + Channels | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Performance Tracking** | ✅ | ✅ | ⚠️ Basic | ✅ LangSmith | ❌ | ✅ | ⚠️ Basic | ⚠️ Basic |
| **Team Collaboration** | ✅ RBAC + Memory | ❌ | ❌ | ❌ | ❌ | ✅ SSO/RBAC | ❌ | ✅ SSO/RBAC |
| **Pricing Transparency** | ✅ Public | ❌ Enterprise | ✅ Free | ⚠️ LangSmith paid | ✅ Free | ❌ Sales call | ✅ Public | ✅ Public |
| **Language** | TypeScript | Python | Python | Python | Python | N/A | TypeScript | TypeScript |

> **Note:** CrewAI, AutoGen, LangGraph, and Agency Swarm are excellent Python libraries/frameworks for building agent systems in code. Relevance AI is GTM-focused. Flowise and n8n are general automation tools. CrewForm is a full-stack platform that wraps orchestration capabilities in a deployable application with a UI, team features, integrations, and marketplace. They're complementary — you could even use crewAI agents inside a CrewForm workflow.

## Contributing

We welcome contributions from everyone! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for:

- 🐛 How to report bugs
- 💡 How to suggest features
- 🔧 Development setup guide
- 📋 Coding standards

## Community

- 💬 **[Discord](https://discord.gg/TAFasJCTWs)** — Chat with the team and community
- 🗣️ **[GitHub Discussions](https://github.com/CrewForm/crewform/discussions)** — Ideas, Q&A, and show & tell
- 🐦 **[Twitter/X](https://twitter.com/CrewForm)** — Product updates and AI ecosystem commentary
- 📧 **Email** — team@crewform.tech

## FAQ

<details>
<summary><strong>What is CrewForm?</strong></summary>

CrewForm is an open-source AI orchestration platform that lets you deploy, manage, and collaborate on multi-agent AI workflows through a visual UI — without vendor lock-in or LLM cost markup.
</details>

<details>
<summary><strong>Is CrewForm free to use?</strong></summary>

Yes. CrewForm's Community Edition is open-source under the AGPL v3 license. You can self-host it for free. We also offer a hosted version with a free tier at [crewform.tech](https://crewform.tech). Paid plans (Pro $39/mo, Team $99/mo, Enterprise custom) unlock additional features.
</details>

<details>
<summary><strong>What is the CE/EE split?</strong></summary>

CrewForm uses an open-core model. All code outside `ee/` is Community Edition (AGPL-3.0, free). Code inside `ee/` is Enterprise Edition (proprietary, requires a license key). CE includes agents, pipeline teams, marketplace, and self-hosting. EE adds orchestrator mode, collaboration, memory, audit logs, and more.
</details>

<details>
<summary><strong>What does BYOK mean?</strong></summary>

BYOK stands for **Bring Your Own Key**. You connect your own API keys from providers like Anthropic, Google, or OpenAI. CrewForm never touches your LLM spend — you pay your provider directly at their standard rates.
</details>

<details>
<summary><strong>How is CrewForm different from crewAI?</strong></summary>

crewAI is a Python library for orchestrating AI agents in code. CrewForm is a full-stack platform with a visual UI, team collaboration, agent marketplace, and self-hosting support. They solve different problems — crewAI is for developers who want a Python framework, CrewForm is for teams who want a deployable application.
</details>

<details>
<summary><strong>Can I self-host CrewForm?</strong></summary>

Yes! CrewForm supports Docker-based self-hosting. See our [self-hosting guide](https://docs.crewform.tech/self-hosting) for instructions.
</details>

<details>
<summary><strong>What LLM providers are supported?</strong></summary>

CrewForm supports **14 providers**: OpenAI, Anthropic, Google Gemini, Groq, Mistral, Cohere, NVIDIA NIM, Perplexity, Together, OpenRouter, HuggingFace, MiniMax, Moonshot, and Venice. More providers can be added via the modular provider architecture.
</details>

<details>
<summary><strong>What integrations are available?</strong></summary>

CrewForm integrates with **Zapier** (7,000+ apps), messaging channels (**Discord**, **Slack**, **Telegram**, **Email**), and output routes (**webhooks**, **MS Teams**, **Asana**, and more). You can trigger agents from external events and deliver results anywhere.
</details>

## License

CrewForm uses a **dual-license** model:

- **Community Edition** (everything outside `ee/`) — [GNU Affero General Public License v3.0](LICENSE)
- **Enterprise Edition** (inside `ee/`) — [CrewForm Enterprise License](ee/LICENSE)

You can use, modify, and distribute the Community Edition freely. Enterprise features require a valid license key. See [LICENSING.md](LICENSING.md) for full details.

---

<div align="center">

**CrewForm** — Form your AI crew ⚡

[Website](https://crewform.tech) · [Docs](https://docs.crewform.tech) · [Discord](https://discord.gg/TAFasJCTWs) · [Twitter](https://twitter.com/CrewForm)

</div>
