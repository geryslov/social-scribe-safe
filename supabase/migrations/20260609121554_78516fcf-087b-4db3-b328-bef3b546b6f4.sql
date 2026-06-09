
CREATE TABLE public.workspace_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  service_name TEXT NOT NULL,
  api_key_encrypted TEXT NOT NULL,
  key_hint TEXT,
  is_valid BOOLEAN DEFAULT true,
  last_validated_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, service_name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_api_keys TO authenticated;
GRANT ALL ON public.workspace_api_keys TO service_role;

ALTER TABLE public.workspace_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view workspace api keys"
  ON public.workspace_api_keys FOR SELECT
  TO authenticated
  USING (public.user_has_workspace_access(workspace_id));

CREATE POLICY "Creators can insert workspace api keys"
  ON public.workspace_api_keys FOR INSERT
  TO authenticated
  WITH CHECK (public.user_can_create_in_workspace(workspace_id));

CREATE POLICY "Creators can update workspace api keys"
  ON public.workspace_api_keys FOR UPDATE
  TO authenticated
  USING (public.user_can_create_in_workspace(workspace_id))
  WITH CHECK (public.user_can_create_in_workspace(workspace_id));

CREATE POLICY "Creators can delete workspace api keys"
  ON public.workspace_api_keys FOR DELETE
  TO authenticated
  USING (public.user_can_create_in_workspace(workspace_id));

CREATE TRIGGER update_workspace_api_keys_updated_at
  BEFORE UPDATE ON public.workspace_api_keys
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
