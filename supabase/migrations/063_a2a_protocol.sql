-- ============================================================================
-- 063: A2A Protocol Support
-- Adds tables for A2A remote agent management and interaction logging
-- ============================================================================

-- ─── Remote Agents ──────────────────────────────────────────────────────────
-- External A2A agents registered by workspace users
create table if not exists public.a2a_remote_agents (
    id          uuid primary key default gen_random_uuid(),
    workspace_id uuid not null references public.workspaces(id) on delete cascade,
    name        text not null,
    base_url    text not null,
    agent_card  jsonb not null default '{}'::jsonb,
    is_enabled  boolean not null default true,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

-- Indexes
create index if not exists idx_a2a_remote_agents_workspace
    on public.a2a_remote_agents(workspace_id);

-- RLS
alter table public.a2a_remote_agents enable row level security;

create policy "a2a_remote_agents_select"
    on public.a2a_remote_agents for select
    using (workspace_id in (
        select wm.workspace_id from public.workspace_members wm
        where wm.user_id = auth.uid()
    ));

create policy "a2a_remote_agents_insert"
    on public.a2a_remote_agents for insert
    with check (workspace_id in (
        select wm.workspace_id from public.workspace_members wm
        where wm.user_id = auth.uid()
    ));

create policy "a2a_remote_agents_update"
    on public.a2a_remote_agents for update
    using (workspace_id in (
        select wm.workspace_id from public.workspace_members wm
        where wm.user_id = auth.uid()
    ));

create policy "a2a_remote_agents_delete"
    on public.a2a_remote_agents for delete
    using (workspace_id in (
        select wm.workspace_id from public.workspace_members wm
        where wm.user_id = auth.uid()
    ));

-- Updated-at trigger
create trigger a2a_remote_agents_updated_at
    before update on public.a2a_remote_agents
    for each row execute function public.update_updated_at();

-- Realtime
alter publication supabase_realtime add table public.a2a_remote_agents;

-- ─── A2A Task Log ───────────────────────────────────────────────────────────
-- Logs of A2A interactions (both inbound and outbound)
create table if not exists public.a2a_task_log (
    id              uuid primary key default gen_random_uuid(),
    workspace_id    uuid not null references public.workspaces(id) on delete cascade,
    direction       text not null check (direction in ('inbound', 'outbound')),
    a2a_task_id     text,
    remote_agent_id uuid references public.a2a_remote_agents(id) on delete set null,
    local_agent_id  uuid references public.agents(id) on delete set null,
    status          text not null default 'submitted',
    input_message   jsonb not null default '{}'::jsonb,
    output_artifacts jsonb not null default '[]'::jsonb,
    created_at      timestamptz not null default now()
);

-- Indexes
create index if not exists idx_a2a_task_log_workspace
    on public.a2a_task_log(workspace_id);
create index if not exists idx_a2a_task_log_remote_agent
    on public.a2a_task_log(remote_agent_id);

-- RLS
alter table public.a2a_task_log enable row level security;

create policy "a2a_task_log_select"
    on public.a2a_task_log for select
    using (workspace_id in (
        select wm.workspace_id from public.workspace_members wm
        where wm.user_id = auth.uid()
    ));

create policy "a2a_task_log_insert"
    on public.a2a_task_log for insert
    with check (workspace_id in (
        select wm.workspace_id from public.workspace_members wm
        where wm.user_id = auth.uid()
    ));

-- Service role bypass for task runner
create policy "a2a_remote_agents_service"
    on public.a2a_remote_agents for all
    using (auth.role() = 'service_role');

create policy "a2a_task_log_service"
    on public.a2a_task_log for all
    using (auth.role() = 'service_role');
