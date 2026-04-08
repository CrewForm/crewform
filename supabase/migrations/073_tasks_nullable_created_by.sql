-- Chat Widget: allow system-created tasks (no user context)
-- Drops the NOT NULL on created_by so chat widget / API tasks can be created
-- without a real auth.users reference.

ALTER TABLE public.tasks ALTER COLUMN created_by DROP NOT NULL;
