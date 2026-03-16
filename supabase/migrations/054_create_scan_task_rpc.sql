-- 054_create_scan_task_rpc.sql
-- SECURITY DEFINER function to create AI injection scan tasks.
-- Bypasses RLS so any authenticated user can trigger a scan during agent submission.

CREATE OR REPLACE FUNCTION public.create_scan_task(
    p_workspace_id UUID,
    p_agent_id UUID,
    p_description TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_task_id UUID;
    v_user_id UUID;
BEGIN
    -- Must be authenticated
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    INSERT INTO public.tasks (
        workspace_id,
        title,
        description,
        assigned_agent_id,
        priority,
        status,
        created_by
    ) VALUES (
        p_workspace_id,
        '[System] Injection Scan',
        p_description,
        p_agent_id,
        'low',
        'dispatched',
        v_user_id
    )
    RETURNING id INTO v_task_id;

    RETURN v_task_id;
END;
$$;

-- Function to read scan task result (bypasses tasks_select RLS)
CREATE OR REPLACE FUNCTION public.get_scan_task_result(p_task_id UUID)
RETURNS TABLE(status TEXT, result JSONB, error TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    RETURN QUERY
    SELECT t.status::TEXT, t.result::JSONB, t.error::TEXT
    FROM public.tasks t
    WHERE t.id = p_task_id
      AND t.title = '[System] Injection Scan';
END;
$$;

-- Function to delete scan task (bypasses tasks_delete RLS)
CREATE OR REPLACE FUNCTION public.delete_scan_task(p_task_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    DELETE FROM public.tasks
    WHERE id = p_task_id
      AND title = '[System] Injection Scan';
END;
$$;
