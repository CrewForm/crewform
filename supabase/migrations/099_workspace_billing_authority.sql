-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Workspace edit rights never confer billing or quota-exemption authority.
CREATE FUNCTION public.protect_workspace_entitlements() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF auth.role()='authenticated' AND NOT public.is_super_admin() THEN
  IF TG_OP='INSERT' THEN
   NEW.plan:='free';NEW.is_beta:=false;NEW.trial_expires_at:=NULL;NEW.suspended_at:=NULL;NEW.suspended_reason:=NULL;
  ELSIF NEW.plan IS DISTINCT FROM OLD.plan OR NEW.is_beta IS DISTINCT FROM OLD.is_beta OR NEW.trial_expires_at IS DISTINCT FROM OLD.trial_expires_at
    OR NEW.suspended_at IS DISTINCT FROM OLD.suspended_at OR NEW.suspended_reason IS DISTINCT FROM OLD.suspended_reason
    OR NEW.owner_id IS DISTINCT FROM OLD.owner_id OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN RAISE EXCEPTION 'Workspace billing entitlements and identity are server-owned';
  END IF;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER a_workspace_entitlements BEFORE INSERT OR UPDATE ON public.workspaces FOR EACH ROW EXECUTE FUNCTION public.protect_workspace_entitlements();
REVOKE ALL ON FUNCTION public.protect_workspace_entitlements() FROM PUBLIC,anon,authenticated;
