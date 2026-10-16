# MIT software and hosted-only billing transition

All implemented CrewForm features are free under MIT, including the former
Enterprise capabilities. Only CrewForm Cloud hosting is paid. Provider costs
remain separate. This policy supersedes the previous paid self-hosted Custom
offer; it does not add unimplemented features such as SAML or native session resume.

## Upgrade order

1. Preserve a verified backup and record the current application, Edge and schema
   versions. Existing releases and published npm versions keep their original
   licences. Do not rewrite old tags or attempt to replace an npm version.
2. Review and apply append-only migration `106_open_software_hosted_resources.sql`
   against the reconciled 105 baseline. It gives every hosting plan the same
   software capabilities, keeps resource allowances and overrides, removes export
   paywalls, and exposes a read-only authenticated deployment-mode RPC.
3. Keep `deployment_policy.hosted=true` on CrewForm Cloud. On your own deployment,
   use a database administrator to set it to false. The local bootstrap already
   does this; frontend edition variables have no authority over server quotas.
4. Deploy matching Edge handlers and frontend/runner. Checkout and portal require
   an owner/admin, verified hosted policy and configured Stripe before contacting
   Stripe. Self-hosted billing renders an informational free-software message.
   Old activation/generation/validation/revocation routes return HTTP 410.
5. Verify free feature availability, hosted run/resource limits and workspace
   isolation. Publish the matching landing change after the deployed behavior
   agrees. New CLI publications need a new version and the MIT licence.

There is no data deletion or subscription migration in this change. Legacy
`ee_licenses`, `enterprise` plans and Stripe reconciliation remain compatible with
existing records, but no longer unlock software. Existing prices, renewal/grace
logic, purchased overrides and manual grants are preserved. Legacy `ee/` module
paths remain MIT-licensed compatibility definitions.

## Review and rollback

Most source-file changes are SPDX header updates. Licence texts, package metadata,
contributor terms and current documentation change together. Third-party
libraries retain their own terms and notices. The initial repository review found
CrewForm copyright notices and no separately attributed source; this is an
inventory observation, not proof of ownership of every contribution.

Validate fresh and upgrade schemas plus hosted/self-hosted/foreign-workspace
cases in isolation. Licence removal must not bypass native consent, role checks,
secret encryption, execution leases, ingress bounds or billing reservations.

Keep matching prior application versions available for operational rollback.
Do not drop billing or execution records. Restoring an earlier runtime does not
revoke MIT rights already granted in published source or change existing Stripe
subscriptions. Any necessary commercial customer communication is separate work.
