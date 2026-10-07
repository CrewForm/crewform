-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Read-only structural prerequisite checks. A schema backup/diff is still required.
SELECT name,present FROM (VALUES
 ('tenant_reference_guard',to_regprocedure('public.validate_tenant_references()') IS NOT NULL),
 ('runner_claim',to_regprocedure('public.claim_next_task(uuid)') IS NOT NULL),
 ('billing_sync',to_regprocedure('public.sync_subscription_to_license()') IS NOT NULL),
 ('subscriptions',to_regclass('public.subscriptions') IS NOT NULL),
 ('output_routes',to_regclass('public.output_routes') IS NOT NULL),
 ('widgets',to_regclass('public.chat_widget_configs') IS NOT NULL),
 ('attachments',to_regclass('public.file_attachments') IS NOT NULL),
 ('knowledge',to_regclass('public.knowledge_documents') IS NOT NULL),
 ('review_not_already_applied',to_regclass('public.execution_usage') IS NULL)
) AS checks(name,present);
SELECT count(*) AS recorded_migrations FROM supabase_migrations.schema_migrations;
SELECT policyname,roles,cmd FROM pg_policies WHERE schemaname='storage' AND tablename='objects';
SELECT id,public,file_size_limit FROM storage.buckets;
