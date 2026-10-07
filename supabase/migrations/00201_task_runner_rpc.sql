-- ────────────────────────────────────────────────────────────────────────────
-- Task Runner: Atomic Task Claiming RPC
-- ────────────────────────────────────────────────────────────────────────────

-- This function is called by the external Node.js Task Runner.
-- It atomically finds the oldest pending task, locks it to prevent other runner
-- instances from claiming it, updates its status to 'running', and returns the details.

CREATE OR REPLACE FUNCTION claim_next_task()
RETURNS table (
  id uuid,
  workspace_id uuid,
  title text,
  description text,
  assigned_agent_id uuid,
  assigned_team_id uuid,
  priority text
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.tasks
  SET
    status = 'running',
    updated_at = NOW()
  WHERE tasks.id = (
    SELECT t.id
    FROM public.tasks t
    WHERE t.status = 'pending'
      -- Only claim single-agent tasks for MVP (teams handled separately later)
      AND t.assigned_agent_id IS NOT NULL
      AND t.assigned_team_id IS NULL
    ORDER BY
      -- Map priority to numeric values conceptually: urgent=1, high=2, medium=3, low=4
      CASE t.priority
        WHEN 'urgent' THEN 1
        WHEN 'high'   THEN 2
        WHEN 'medium' THEN 3
        WHEN 'low'    THEN 4
        ELSE 5
      END ASC,
      t.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING
    tasks.id,
    tasks.workspace_id,
    tasks.title,
    tasks.description,
    tasks.assigned_agent_id,
    tasks.assigned_team_id,
    tasks.priority;
END;
$$;
