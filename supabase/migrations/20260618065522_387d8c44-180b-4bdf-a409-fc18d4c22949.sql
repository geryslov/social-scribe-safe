
-- Permission helper functions for workspace role-based access control

-- Get caller's role in a workspace; global admin returns 'admin'
CREATE OR REPLACE FUNCTION public.user_workspace_role(_workspace_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.has_role(auth.uid(), 'admin'::app_role) THEN 'admin'
    ELSE (
      SELECT role::text
      FROM public.workspace_members
      WHERE user_id = auth.uid() AND workspace_id = _workspace_id
      LIMIT 1
    )
  END
$$;

CREATE OR REPLACE FUNCTION public.user_can_generate_ai(_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_workspace_role(_workspace_id) IN ('owner','admin','creator')
$$;

CREATE OR REPLACE FUNCTION public.user_can_assign(_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_workspace_role(_workspace_id) IN ('owner','admin','creator')
$$;

CREATE OR REPLACE FUNCTION public.user_can_publish_linkedin(_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_workspace_role(_workspace_id) IN ('owner','admin','creator')
$$;

CREATE OR REPLACE FUNCTION public.user_can_manage_workspace(_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_workspace_role(_workspace_id) IN ('owner','admin')
$$;

-- Tighten workspace UPDATE: only owner/admin (or global admin) can edit workspace settings/invite
DROP POLICY IF EXISTS "Workspace admins can update" ON public.workspaces;
DROP POLICY IF EXISTS "Workspace owners can update" ON public.workspaces;
DROP POLICY IF EXISTS "Members can update workspaces" ON public.workspaces;
CREATE POLICY "Workspace managers can update workspace"
  ON public.workspaces
  FOR UPDATE
  TO authenticated
  USING (public.user_can_manage_workspace(id))
  WITH CHECK (public.user_can_manage_workspace(id));

-- Tighten workspace_members writes: only managers can add/remove/change roles
DROP POLICY IF EXISTS "Members can insert workspace_members" ON public.workspace_members;
DROP POLICY IF EXISTS "Members can update workspace_members" ON public.workspace_members;
DROP POLICY IF EXISTS "Members can delete workspace_members" ON public.workspace_members;
DROP POLICY IF EXISTS "Workspace admins can manage members" ON public.workspace_members;

CREATE POLICY "Managers can insert workspace members"
  ON public.workspace_members
  FOR INSERT
  TO authenticated
  WITH CHECK (public.user_can_manage_workspace(workspace_id));

CREATE POLICY "Managers can update workspace members"
  ON public.workspace_members
  FOR UPDATE
  TO authenticated
  USING (public.user_can_manage_workspace(workspace_id))
  WITH CHECK (public.user_can_manage_workspace(workspace_id));

CREATE POLICY "Managers can delete workspace members"
  ON public.workspace_members
  FOR DELETE
  TO authenticated
  USING (public.user_can_manage_workspace(workspace_id));
