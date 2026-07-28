CREATE TABLE public.engagement_target_comments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  target_id      UUID NOT NULL REFERENCES public.engagement_targets(id) ON DELETE CASCADE,
  dedup_key      TEXT NOT NULL,
  comment_urn    TEXT,
  comment_url    TEXT,
  comment_text   TEXT,
  commented_at   TIMESTAMPTZ,
  reactions_count INTEGER NOT NULL DEFAULT 0,
  parent_post_url        TEXT,
  parent_post_urn        TEXT,
  parent_post_author_name    TEXT,
  parent_post_author_headline TEXT,
  parent_post_author_url TEXT,
  parent_post_content    TEXT,
  parent_post_published_at TIMESTAMPTZ,
  comment_metadata JSONB NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (target_id, dedup_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.engagement_target_comments TO authenticated;
GRANT ALL ON public.engagement_target_comments TO service_role;

ALTER TABLE public.engagement_targets
  ADD COLUMN IF NOT EXISTS last_comments_fetched_at TIMESTAMPTZ;

ALTER TABLE public.engagement_target_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view target comments in their workspaces"
ON public.engagement_target_comments FOR SELECT TO authenticated
USING (public.user_has_workspace_access(workspace_id));

CREATE POLICY "Workspace members can create target comments"
ON public.engagement_target_comments FOR INSERT TO authenticated
WITH CHECK (public.user_can_create_in_workspace(workspace_id));

CREATE POLICY "Workspace members can update target comments"
ON public.engagement_target_comments FOR UPDATE TO authenticated
USING (public.user_can_create_in_workspace(workspace_id))
WITH CHECK (public.user_can_create_in_workspace(workspace_id));

CREATE POLICY "Workspace members can delete target comments"
ON public.engagement_target_comments FOR DELETE TO authenticated
USING (public.user_can_create_in_workspace(workspace_id));

CREATE INDEX idx_target_comments_workspace  ON public.engagement_target_comments(workspace_id);
CREATE INDEX idx_target_comments_target     ON public.engagement_target_comments(target_id);
CREATE INDEX idx_target_comments_commented  ON public.engagement_target_comments(target_id, commented_at DESC);
CREATE INDEX idx_target_comments_created    ON public.engagement_target_comments(workspace_id, created_at DESC);