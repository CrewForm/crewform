-- 069_task_interaction_support.sql
-- Add support for AG-UI rich interactions: approval flows, data confirmation, choices.

-- The status column is TEXT with a CHECK constraint, not a PostgreSQL enum.
-- Drop the existing constraint and add a new one that includes 'waiting_for_input'.
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check
    CHECK (status IN ('pending', 'dispatched', 'running', 'waiting_for_input', 'completed', 'failed', 'cancelled'));

-- Store the current interaction context on the task (what the agent is asking)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS interaction_context jsonb;

-- Index for quick lookup of tasks waiting for input
CREATE INDEX IF NOT EXISTS idx_tasks_waiting_for_input
    ON tasks (status)
    WHERE status = 'waiting_for_input';

COMMENT ON COLUMN tasks.interaction_context IS 'AG-UI interaction request: {interactionId, type, title, description, data, choices, requestedAt, timeoutMs}';
