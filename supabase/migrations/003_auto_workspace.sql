-- SPDX-License-Identifier: MIT
-- Copyright (C) 2026 CrewForm
--
-- 003_auto_workspace.sql — Auto-create workspace on user signup
-- Trigger fires on auth.users INSERT and creates a default workspace
-- with the user as owner.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  workspace_name TEXT;
  workspace_slug TEXT;
  new_workspace_id UUID;
BEGIN
  -- Build workspace name from email username or raw_user_meta_data
  workspace_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    SPLIT_PART(NEW.email, '@', 1)
  ) || '''s Workspace';

  -- Build a URL-safe slug from the email username + random suffix
  workspace_slug := LOWER(REGEXP_REPLACE(
    SPLIT_PART(NEW.email, '@', 1),
    '[^a-z0-9]', '-', 'g'
  )) || '-' || SUBSTR(REPLACE(gen_random_uuid()::text, '-', ''), 1, 8);

  -- Create the workspace
  INSERT INTO public.workspaces (name, slug, owner_id)
  VALUES (workspace_name, workspace_slug, NEW.id)
  RETURNING id INTO new_workspace_id;

  -- Add user as owner in workspace_members
  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (new_workspace_id, NEW.id, 'owner');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on new user creation
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
