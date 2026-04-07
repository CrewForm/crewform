-- 069_task_interaction_support.sql
-- Add support for AG-UI rich interactions: approval flows, data confirmation, choices.

-- Add waiting_for_input to task status enum
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'waiting_for_input' AFTER 'running';

-- Store the current interaction context on the task (what the agent is asking)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS interaction_context jsonb;

-- Index for quick lookup of tasks waiting for input
CREATE INDEX IF NOT EXISTS idx_tasks_waiting_for_input
    ON tasks (status)
    WHERE status = 'waiting_for_input';

COMMENT ON COLUMN tasks.interaction_context IS 'AG-UI interaction request: {interactionId, type, title, description, data, choices, requestedAt, timeoutMs}';
