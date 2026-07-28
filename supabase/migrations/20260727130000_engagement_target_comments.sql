-- =============================================================================
-- Engagement — target comment activity
--
-- Tracks comments that engagement targets leave on OTHER people's posts (their
-- outbound comment activity), as opposed to `engagement_posts` (their own posts)
-- and `engagement_comments` (comments WE draft/post on their posts).
--
-- Powers the merged activity feed: a publisher can see which conversations a
-- target is already in and jump into the same thread.
--
-- Source: Apify actor harvestapi/linkedin-profile-comments (no cookies, PAYG).
-- Workspace-scoped, same RLS pattern as the rest of the engagement layer.
-- =============================================================================

CREATE TABLE public.engagement_target_comments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  target_id      UUID NOT NULL REFERENCES public.engagement_targets(id) ON DELETE CASCADE,

  -- Stable dedup key per target. Prefer the comment URN, fall back to the
  -- comment URL, else parent-post-url#timestamp. Computed in the edge function.
  dedup_key      TEXT NOT NULL,

  -- The comment the target left
  comment_urn    TEXT,
  comment_url    TEXT,           -- permalink to the comment (when available)
  comment_text   TEXT,
  commented_at   TIMESTAMPTZ,
  reactions_count INTEGER NOT NULL DEFAULT 0,

  -- The post the target commented ON (someone else's post)
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

-- Track when we last pulled comment activity for a target (mirrors
-- last_fetched_at for posts) so fetches can stay incremental.
ALTER TABLE public.engagement_targets
  ADD COLUMN IF NOT EXISTS last_comments_fetched_at TIMESTAMPTZ;


-- =============================================================================
-- ROW LEVEL SECURITY  (same helpers as engagement_posts)
-- =============================================================================

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


-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX idx_target_comments_workspace  ON public.engagement_target_comments(workspace_id);
CREATE INDEX idx_target_comments_target     ON public.engagement_target_comments(target_id);
CREATE INDEX idx_target_comments_commented  ON public.engagement_target_comments(target_id, commented_at DESC);
-- Feed query filters by created_at across a publisher's targets.
CREATE INDEX idx_target_comments_created    ON public.engagement_target_comments(workspace_id, created_at DESC);
