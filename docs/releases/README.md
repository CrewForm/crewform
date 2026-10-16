# Release checklist

Every platform release includes the public website at
[vincentgrobler/crewform-landing](https://github.com/vincentgrobler/crewform-landing),
served at [crewform.tech](https://crewform.tech). The platform release and the
landing page are separate repositories and deployments; updating one does not
update the other.

Before release sign-off:

- Update platform versions, changelogs and applicable upgrade/rollback notes.
  Keep independently published CLI/runtime versions accurate.
- Review landing copy against shipped behavior: features, supported execution
  paths, onboarding commands, plan labels, usage allowances and limitations.
  Avoid advertising deferred capabilities or unverified performance claims.
- When plans change, regenerate the landing catalogue from the platform's
  `shared/plan-catalogue.json`; do not independently edit generated prices.
  `npm run plans:generate -- --landing` targets the separate checkout at
  `crewform-landing/`. Use a clean checkout and preserve unrelated local edits.
- Check public release, documentation, npm, app and self-hosting links. Explain
  provider costs and native account restrictions wherever relevant.
- Build the landing site and review desktop/mobile presentation. Merge its
  focused PR and verify the deployed public page, not only its preview.
- Record the platform release, landing commit/PR and deployment verification.
  If the landing update is pending, record its specific gaps and next scope;
  do not mark public-site synchronization complete.

## 2026-10-16 follow-through

Platform reliability changes merged in PRs #414–419, with production migrations
107–109 and matching application/runner rollout. See [1.11.0 upgrade notes](v1.11.0.md).
The earlier MIT/hosted-only policy is migration 106. Cloud Pro remains $15/month
and Team $49/month; paid self-hosted Custom is retired.

Landing [PR #23](https://github.com/vincentgrobler/crewform-landing/pull/23)
merged at `9d4e5ea` and updates inspectable workflows, sequential personal-device
pipelines, explicit recovery limits and the complete setup path. Unsupported
reliability percentages and one-click deployment claims were removed. Its
walkthrough links to instructions for the published MIT CLI 0.3.0 and a source
checkout alternative. The CLI is independently versioned from the platform.

Verify the deployed page and version markers before publishing the release.
Do not describe npm 0.3.0 as published until the registry metadata agrees.
Publishing a GitHub release triggers the repository's existing Discord
announcement workflow, including its configured `@everyone` mention; release
publication and that outbound announcement need explicit authorization.
