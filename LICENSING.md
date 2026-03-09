# CrewForm Licensing

CrewForm uses a **dual-license** model: an open-source Community Edition and a proprietary Enterprise Edition.

## Community Edition (CE)

**License:** [GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE)

All code **outside** the `ee/` directory is licensed under AGPL-3.0. You are free to use, modify, and distribute this code under the terms of the AGPL-3.0 license. If you deploy a modified version as a network service, you must make your source code available to users of that service.

**CE includes:**
- Agent creation, templates, and configuration
- Single-agent task execution
- Pipeline mode for teams
- BYOK API key management
- Dashboard with basic statistics
- Marketplace browsing and agent installation
- HTTP webhook destinations
- Self-hosting via Docker Compose
- REST API (basic CRUD)

## Enterprise Edition (EE)

**License:** [CrewForm Enterprise License](ee/LICENSE)

All code **inside** the `ee/` directory is proprietary and requires a valid Enterprise license key. This code is not covered by the AGPL-3.0 license.

**EE adds (Pro and above):**
- Orchestrator mode (brain agent + worker delegation)
- Advanced analytics, charts, and CSV export
- Prompt history with diff viewer
- Advanced webhooks (Slack, Discord, Zapier, Asana)
- Messaging channels (Telegram, Discord bots)
- Team triggers (scheduled + webhook)
- File attachments
- Custom tools
- Billing and Stripe integration

**EE adds (Team and above):**
- Collaboration mode (multi-agent discussion)
- Team Memory (pgvector semantic search)
- Workspace members, RBAC, and invitations

**EE adds (Enterprise):**
- Audit log viewer and log streaming (Datadog/Splunk)
- Swarm (multi-runner concurrency pool)
- Marketplace publishing
- Admin panel
- SSO / SAML (coming soon)

## Obtaining a License

To use Enterprise features, you need a license key:

1. **CrewForm Cloud** — Enterprise features are included with paid subscriptions at [crewform.tech](https://crewform.tech):
   - **Pro** — $39/month (Orchestrator, channels, custom tools, analytics)
   - **Team** — $99/month (Collaboration mode, memory, RBAC)
   - **Enterprise** — Custom pricing (Audit logs, swarm, SSO)
2. **Self-hosted** — Contact [team@crewform.tech](mailto:team@crewform.tech) for a self-hosted license key

## Contributing

- Contributions to **Community Edition** (outside `ee/`) are welcome under AGPL-3.0
- Contributions to **Enterprise Edition** (inside `ee/`) require a signed Contributor License Agreement (CLA)
- Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines

## Questions?

If you're unsure about licensing, reach out at [team@crewform.tech](mailto:team@crewform.tech).
