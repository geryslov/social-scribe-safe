-- =============================================================================
-- Engagement folders — organize targets into per-publisher folders.
--
-- Folders are scoped to a publisher (engager). A target can live in zero or
-- one folder. Deleting a folder sets its targets back to "Unfiled" (NULL).
-- =============================================================================

CREATE TABLE public.engagement_folders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  publisher_id  UUID NOT NULL REFERENCES public.publishers(id) ON DELETE CASCADE,

  name          TEXT NOT NULL,
  position      INTEGER NOT NULL DEFAULT 0,

  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(workspace_id, publisher_id, name)
);

CREATE INDEX idx_engagement_folders_publisher
  ON public.engagement_folders(publisher_id);
CREATE INDEX idx_engagement_folders_workspace
  ON public.engagement_folders(workspace_id);

ALTER TABLE public.engagement_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view engagement folders in their workspaces"
ON public.engagement_folders FOR SELECT
USING (public.user_has_workspace_access(workspace_id));

CREATE POLICY "Workspace admins can create engagement folders"
ON public.engagement_folders FOR INSERT
WITH CHECK (public.user_can_create_in_workspace(workspace_id));

CREATE POLICY "Workspace admins can update engagement folders"
ON public.engagement_folders FOR UPDATE
USING (public.user_can_create_in_workspace(workspace_id))
WITH CHECK (public.user_can_create_in_workspace(workspace_id));

CREATE POLICY "Workspace admins can delete engagement folders"
ON public.engagement_folders FOR DELETE
USING (public.user_can_create_in_workspace(workspace_id));

-- -----------------------------------------------------------------------------
-- Attach engagement_targets to folders (optional, NULL = Unfiled).
-- ON DELETE SET NULL so deleting a folder drops its targets to Unfiled
-- rather than removing them.
-- -----------------------------------------------------------------------------

ALTER TABLE public.engagement_targets
  ADD COLUMN IF NOT EXISTS folder_id UUID
    REFERENCES public.engagement_folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_engagement_targets_folder
  ON public.engagement_targets(folder_id);
