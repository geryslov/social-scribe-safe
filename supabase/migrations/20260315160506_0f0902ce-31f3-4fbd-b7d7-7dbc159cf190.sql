-- Fix publishers SELECT policy to require authentication and not expose records with NULL workspace_id
DROP POLICY "Users see publishers in their workspaces" ON public.publishers;

CREATE POLICY "Users see publishers in their workspaces"
ON public.publishers
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR has_role(auth.uid(), 'admin'::app_role)
  OR (workspace_id IS NOT NULL AND user_has_workspace_access(workspace_id))
);