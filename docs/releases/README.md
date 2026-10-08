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

## v1.10.0 follow-through

The platform release is [v1.10.0](https://github.com/CrewForm/crewform/releases/tag/v1.10.0).
Landing [PR #21](https://github.com/vincentgrobler/crewform-landing/pull/21)
already aligns Pro $15/month, Team $49/month and on-premises Custom pricing.

The next landing update must explain native CLI/ACP execution and personal
Cloud-to-laptop workers, link the release/upgrade guidance, and use the published
`@crewformhq/cli@0.2.0` commands. State that provider logins stay local while
results/logs upload to Cloud, and that personal workers currently support
single-agent jobs. Review existing tier labels and quantified claims against
source and evidence. Mixed Cloud/local teams, account pools and general
checkpoint/resume must remain outside the advertised shipped feature set.
