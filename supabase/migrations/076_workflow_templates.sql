-- ─────────────────────────────────────────────────────────────────────────────
-- 076 — Workflow Templates
-- Reusable workflow blueprints with fill-in-the-blank variables.
-- ─────────────────────────────────────────────────────────────────────────────

create table workflow_templates (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid references workspaces(id) on delete cascade,
  creator_id    uuid references auth.users(id) on delete set null,

  -- Metadata
  name          text not null,
  description   text not null,
  readme        text,
  category      text not null default 'general',
  tags          text[] default '{}',
  icon          text default '🤖',

  -- Template definition (blueprint of agents, team, trigger)
  template_definition jsonb not null,
  -- Variable definitions (what the user fills in at install time)
  variables     jsonb not null default '[]',

  -- Marketplace
  is_published  boolean default false,
  install_count int     default 0,
  rating_avg    numeric(3,2) default 0,

  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- Indexes
create index idx_wft_published on workflow_templates (is_published) where is_published = true;
create index idx_wft_category  on workflow_templates (category) where is_published = true;
create index idx_wft_workspace on workflow_templates (workspace_id);

-- RLS
alter table workflow_templates enable row level security;

-- Anyone can read published templates
create policy "Anyone can read published templates"
  on workflow_templates for select
  using (is_published = true);

-- Workspace members can read their own unpublished templates
create policy "Workspace members can read own templates"
  on workflow_templates for select
  using (
    workspace_id in (
      select workspace_id from workspace_members where user_id = auth.uid()
    )
  );

-- Workspace owners can insert/update/delete their templates
create policy "Workspace owners can manage templates"
  on workflow_templates for all
  using (
    workspace_id in (
      select workspace_id from workspace_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

-- Service role bypass (for install_count increments)
create policy "Service role full access"
  on workflow_templates for all
  using (auth.role() = 'service_role');
