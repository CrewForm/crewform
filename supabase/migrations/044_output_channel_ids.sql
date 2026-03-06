-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Copyright (C) 2026 CrewForm
--
-- 044_output_route_ids.sql — Add output route selector to agents and teams
--
-- NULL  = dispatch to ALL active output routes (default, backwards-compatible)
-- '{}'  = dispatch to NO routes
-- array = dispatch to only the specified route UUIDs

alter table public.agents
    add column if not exists output_route_ids uuid[] default null;

alter table public.teams
    add column if not exists output_route_ids uuid[] default null;
