# Security Policy

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| 0.1.x   | ✅ Current release |

As CrewForm is in active early development, security patches are applied to the latest version only.

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please report them via email to: **team@crewform.tech**

Include as much of the following as possible:

- Type of vulnerability (e.g. SQL injection, XSS, RLS bypass, key exposure)
- Full path(s) of the affected source file(s)
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if available)
- Impact assessment — what an attacker could achieve

### What to Expect

| Stage | Timeline |
|-------|----------|
| Acknowledgement | Within **48 hours** |
| Initial assessment | Within **5 business days** |
| Fix or mitigation | Within **30 days** (for confirmed issues) |
| Public disclosure | After the fix is released |

We will keep you informed of progress toward a fix and full announcement.

## Scope

### In Scope

- CrewForm web application (`src/`)
- Enterprise Edition code (`ee/`)
- Task Runner service (`task-runner/`)
- Supabase configuration and RLS policies (`supabase/`)
- Authentication and authorisation flows
- API key storage and encryption
- License key validation and generation
- Edge functions

### Out of Scope

- Third-party dependencies (report to the upstream project)
- Issues in third-party LLM provider APIs
- Social engineering attacks
- Denial of service attacks

## Security Measures

CrewForm takes security seriously. Current measures include:

- **AES-256-GCM encryption** for all stored API keys
- **Row-Level Security (RLS)** in Supabase for multi-tenant data isolation
- **AGPL licence headers** enforced via CI
- **Sensitive document guards** in CI to prevent internal docs from leaking to the public repo

## Recognition

We appreciate the security research community. Contributors who responsibly disclose vulnerabilities will be credited in our release notes (unless they prefer to remain anonymous).

---

Thank you for helping keep CrewForm and its users safe.
