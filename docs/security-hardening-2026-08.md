# Security hardening deployment checklist (August 2026)

The hardening migration and application changes intentionally fail closed. Complete these steps in the same maintenance window as deploying the code.

1. Generate a stable 32-byte encryption key (for example, `openssl rand -hex 32`) and set the identical `API_KEY_ENCRYPTION_KEY` value on Supabase Edge Functions and the task runner. Back it up in the production secret manager; losing it makes encrypted provider credentials unrecoverable.
2. Set strong independent values for `WEBHOOK_SECRET`, `CRON_SECRET`, and `DATABASE_WEBHOOK_SECRET`. Configure database webhook and cron callers to send the corresponding headers.
3. Set `SLACK_SIGNING_SECRET`, `TELEGRAM_WEBHOOK_SECRET`, `TRELLO_APP_SECRET`, and `RESEND_WEBHOOK_SECRET` for integrations that are enabled. Re-register Telegram with `secret_token` set to `TELEGRAM_WEBHOOK_SECRET`.
4. Deploy migration `085_comprehensive_security_hardening.sql`, then deploy all Edge Functions and the task runner together.
5. Open Google integration settings once (or reconnect Google) to migrate legacy OAuth tokens to encrypted storage. Opening provider-key settings similarly migrates legacy provider keys.
6. Regenerate MCP, A2A, and AG-UI publishing keys. Old keys do not have the new one-way authentication hash and intentionally stop authenticating.
7. Rotate every credential that was ever stored in `output_routes.config`, messaging-channel config, `api_keys`, or Google connections while the affected policy was live. Treat historical webhook URLs and tokens as exposed.
8. Verify anon reads/writes fail, `output_routes` is absent from `supabase_realtime`, and `api_keys.encrypted_key` / Google token columns are inaccessible to authenticated clients.

Do not remove the fail-closed checks to restore a misconfigured integration; configure the missing secret instead.
