# Changelog

## 0.3.0

- MIT licensed distribution, following the repository's licensing transition.
- `crewform demo` runs a scripted three-step review-pack workflow offline and
  exports a clearly labeled simulated artifact. No provider key or login required.
- `crewform doctor --json` reports runtime availability and setup actions;
  `--runtime codex:cli` checks one runtime and fails if unavailable.
- Versioned pipeline output contracts stop invalid handoffs without automatic retries; JSON results include per-step outputs.
- Workflows requiring durable human approvals must run through the platform.
- `--device-profile <name>` isolates personal-worker credentials for multiple local runtime profiles, with the original default configuration preserved.
- Personal workers accept approved sequential pipeline steps after backend migration 108. API/native/ACP execution and existing task commands remain.

Version 0.2.0 was published under its original license. This release does not
modify that immutable package. Native subscription eligibility and limits still
belong to the installed agent provider; diagnostics do not validate a login.
