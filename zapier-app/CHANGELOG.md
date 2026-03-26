## 1.3.0

- Fix: Revert Authorization header change to prevent JWT conflict. Auth is handled via X-API-Key header.

## 1.2.0

- Fix authentication header for Supabase Edge Function compatibility
- Add Authorization header alongside X-API-Key for reliable subscribe/unsubscribe

## 1.1.0

- New feature: Agent and Team filtering on triggers. Users can now scope triggers to a specific agent or team instead of receiving events for the entire workspace.
- Update trigger/task_completed — added optional Agent dropdown
- Update trigger/task_failed — added optional Agent dropdown
- Update trigger/task_started — added optional Agent dropdown
- Update trigger/team_run_completed — added optional Team dropdown
- Update trigger/team_run_failed — added optional Team dropdown

## 1.0.0

Initial release to public.
