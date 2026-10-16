# CrewForm licensing and hosting

All CrewForm-owned source code in this repository, including the CLI, local
agent runtime and the legacy `ee/` directory, is licensed under the [MIT License](LICENSE).
All implemented features are free to use, modify and self-host. No activation
key or paid software licence is required. Third-party dependencies retain their
own licences and notices.

## CrewForm Cloud

Payment is only for using CrewForm's hosted environment. Cloud Free, Pro
($15/workspace/month) and Team ($49/workspace/month) include the same software
capabilities, with different hosted resource allowances. Provider/API usage and
native provider subscription costs are separate. Existing subscriptions retain
their configured prices and purchased allowances until deliberately changed.

There is no paid self-hosted or Enterprise software edition. The legacy
`enterprise` database plan and `ee_licenses` records remain for compatibility
with existing hosted billing data; they do not control software feature access.
Legacy activation/generation/validation/revocation endpoints return HTTP 410.

## Self-hosting

Use all implemented features on infrastructure you manage, including collaboration,
team memory, RBAC, analytics, audit logs and multiple runners. Deployment and
provider costs are yours. Set the server-owned `deployment_policy.hosted=false`
when configuring your own deployment; the local evaluation bootstrap does this.
Do not change this policy on CrewForm Cloud. Browser flags cannot bypass hosted
quotas. Authorization, native consent and operational safety limits apply in
both environments.

## Contributions and earlier versions

New contributions are accepted under MIT. Contributors must have the right to
submit their work and preserve applicable third-party notices. No proprietary
Enterprise contributor agreement is required for the current source.

Previously released versions retain the licences distributed with them. This
transition does not rewrite old tags, remove third-party obligations or revoke
rights already granted. New npm publications must include the MIT licence and
accurate package metadata; existing npm versions are unchanged.
