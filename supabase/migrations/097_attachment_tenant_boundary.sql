-- SPDX-License-Identifier: AGPL-3.0-or-later
CREATE FUNCTION public.validate_attachment_scope() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_row public.file_attachments;v_parent jsonb;v_count int;
BEGIN
 IF TG_OP='DELETE' THEN v_row:=OLD; ELSE v_row:=NEW; END IF;
 IF (v_row.task_id IS NULL)=(v_row.team_run_id IS NULL) THEN RAISE EXCEPTION 'Attachment requires exactly one parent'; END IF;
 IF v_row.task_id IS NOT NULL THEN SELECT to_jsonb(t) INTO v_parent FROM public.tasks t WHERE t.id=v_row.task_id AND t.workspace_id=v_row.workspace_id FOR UPDATE;
 ELSE SELECT to_jsonb(t) INTO v_parent FROM public.team_runs t WHERE t.id=v_row.team_run_id AND t.workspace_id=v_row.workspace_id FOR UPDATE; END IF;
 IF v_parent IS NULL THEN
  -- Foreign-key cascades can delete the parent before this child trigger runs.
  -- Only nested deletion / FK creator nulling may complete; no new row is admitted.
  IF pg_trigger_depth()>1 AND TG_OP='DELETE' THEN RETURN OLD; END IF;
  -- A creator SET NULL can run before the parent's queued CASCADE. Skip this
  -- update: rechecking its now-missing parent FK would block account deletion.
  -- The parent CASCADE removes the child; no missing-parent row is admitted.
  IF pg_trigger_depth()>1 AND TG_OP='UPDATE' AND NEW.created_by IS NULL AND OLD.created_by IS NOT NULL AND (to_jsonb(NEW)-'created_by')=(to_jsonb(OLD)-'created_by') THEN RETURN NULL; END IF;
  RAISE EXCEPTION 'Attachment parent belongs to another workspace';
 END IF;
 IF v_row.storage_path NOT LIKE v_row.workspace_id::text||'/'||coalesce(v_row.task_id,v_row.team_run_id)::text||'/'||v_row.direction||'/%'
 OR v_row.storage_path ~ '(^|/)\.{1,2}(/|$)' OR v_row.file_size<0 OR v_row.file_size>10485760 THEN RAISE EXCEPTION 'Invalid attachment path or size'; END IF;
 IF auth.role()='authenticated' THEN
  IF v_row.direction<>'input' OR v_parent->>'status' NOT IN('pending','dispatched','draft') THEN RAISE EXCEPTION 'Inputs can only be changed before execution'; END IF;
  IF TG_OP='INSERT' THEN NEW.created_by:=auth.uid(); END IF;
 END IF;
 IF TG_OP='INSERT' AND v_row.direction='input' THEN
  SELECT count(*) INTO v_count FROM public.file_attachments WHERE workspace_id=v_row.workspace_id AND direction='input'
  AND (task_id=v_row.task_id OR team_run_id=v_row.team_run_id);
  IF v_count>=5 THEN RAISE EXCEPTION 'Maximum five input attachments'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END;
$$;
CREATE TRIGGER attachment_scope BEFORE INSERT OR UPDATE OR DELETE ON public.file_attachments FOR EACH ROW EXECUTE FUNCTION public.validate_attachment_scope();
REVOKE ALL ON FUNCTION public.validate_attachment_scope() FROM PUBLIC,anon,authenticated;
-- Storage uses the same tenant/parent prefix. No authenticated overwrite policy:
-- uploaded objects are immutable; replacement uses a new unique path.
INSERT INTO storage.buckets(id,name,public,file_size_limit) VALUES('attachments','attachments',false,10485760)
ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=10485760;
CREATE FUNCTION public.can_access_attachment_object(p_name text,p_write boolean) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_ws uuid;v_parent uuid;v_status text;
BEGIN
 BEGIN v_ws:=split_part(p_name,'/',1)::uuid;v_parent:=split_part(p_name,'/',2)::uuid; EXCEPTION WHEN invalid_text_representation THEN RETURN false; END;
 IF NOT public.is_workspace_member(v_ws) THEN RETURN false; END IF;
 IF NOT p_write THEN RETURN true; END IF;
 IF split_part(p_name,'/',3)<>'input' OR p_name ~ '(^|/)\.{1,2}(/|$)' THEN RETURN false; END IF;
 SELECT status INTO v_status FROM public.tasks WHERE id=v_parent AND workspace_id=v_ws;
 IF NOT FOUND THEN SELECT status INTO v_status FROM public.team_runs WHERE id=v_parent AND workspace_id=v_ws; END IF;
 RETURN coalesce(v_status IN('pending','dispatched','draft'),false);
END;
$$;
REVOKE ALL ON FUNCTION public.can_access_attachment_object(text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_access_attachment_object(text,boolean) TO authenticated;
-- Remove historical manual policies that would otherwise OR away tenant checks.
DROP POLICY IF EXISTS "Authenticated users can upload" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read" ON storage.objects;
CREATE POLICY attachments_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='attachments' AND public.can_access_attachment_object(name,true));
CREATE POLICY attachments_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='attachments' AND public.can_access_attachment_object(name,false));
CREATE POLICY attachments_delete ON storage.objects FOR DELETE TO authenticated USING(bucket_id='attachments' AND public.can_access_attachment_object(name,true));
