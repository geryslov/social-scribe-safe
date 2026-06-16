
CREATE TABLE public.engagement_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  publisher_id UUID NOT NULL REFERENCES public.publishers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.engagement_folders TO authenticated;
GRANT ALL ON public.engagement_folders TO service_role;

ALTER TABLE public.engagement_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View folders in workspace" ON public.engagement_folders
  FOR SELECT USING (public.user_has_workspace_access(workspace_id));

CREATE POLICY "Create folders in workspace" ON public.engagement_folders
  FOR INSERT WITH CHECK (public.user_can_create_in_workspace(workspace_id));

CREATE POLICY "Update folders in workspace" ON public.engagement_folders
  FOR UPDATE USING (public.user_can_create_in_workspace(workspace_id))
  WITH CHECK (public.user_can_create_in_workspace(workspace_id));

CREATE POLICY "Delete folders in workspace" ON public.engagement_folders
  FOR DELETE USING (public.user_can_create_in_workspace(workspace_id));

CREATE TRIGGER update_engagement_folders_updated_at
  BEFORE UPDATE ON public.engagement_folders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_engagement_folders_publisher ON public.engagement_folders(publisher_id, position);

ALTER TABLE public.engagement_targets
  ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES public.engagement_folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_engagement_targets_folder ON public.engagement_targets(folder_id);
