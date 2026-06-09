-- =============================================================================
-- Engagement Layer — Community engagement pipeline
--
-- Tracks people to engage with, fetches their recent LinkedIn posts,
-- generates/posts comments via the publisher's OAuth token.
-- All tables workspace-scoped following existing RLS patterns.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. engagement_targets
--    People the agency wants to engage with per publisher.
-- -----------------------------------------------------------------------------
CREATE TABLE public.engagement_targets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  publisher_id  UUID NOT NULL REFERENCES public.publishers(id) ON DELETE CASCADE,

  name          TEXT NOT NULL,
  linkedin_url  TEXT NOT NULL,
  linkedin_username TEXT,  -- extracted from URL, e.g. "johndoe"
  headline      TEXT,
  avatar_url    TEXT,
  notes         TEXT,

  is_active     BOOLEAN NOT NULL DEFAULT true,
  last_fetched_at TIMESTAMPTZ,

  created_by    UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(workspace_id, publisher_id, linkedin_url)
);

-- -----------------------------------------------------------------------------
-- 2. engagement_posts
--    LinkedIn posts fetched from engagement targets.
-- -----------------------------------------------------------------------------
CREATE TABLE public.engagement_posts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  target_id       UUID NOT NULL REFERENCES public.engagement_targets(id) ON DELETE CASCADE,

  -- LinkedIn post identifiers
  linkedin_post_urn TEXT,           -- urn:li:activity:xxx or urn:li:ugcPost:xxx
  linkedin_post_url TEXT NOT NULL,

  -- Post content
  content         TEXT,
  published_at    TIMESTAMPTZ,

  -- Engagement metrics
  likes_count     INTEGER DEFAULT 0,
  comments_count  INTEGER DEFAULT 0,
  shares_count    INTEGER DEFAULT 0,

  -- Metadata
  post_metadata   JSONB DEFAULT '{}',

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Dedup: same post URL per workspace
  UNIQUE(workspace_id, linkedin_post_url)
);

-- -----------------------------------------------------------------------------
-- 3. engagement_comments
--    Comments drafted/posted on engagement posts.
-- -----------------------------------------------------------------------------
CREATE TABLE public.engagement_comments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  publisher_id    UUID NOT NULL REFERENCES public.publishers(id) ON DELETE CASCADE,
  post_id         UUID NOT NULL REFERENCES public.engagement_posts(id) ON DELETE CASCADE,

  -- Comment content
  comment_text    TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'posted', 'failed')),

  -- LinkedIn response
  linkedin_comment_urn TEXT,
  posted_at       TIMESTAMPTZ,
  error_message   TEXT,

  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE public.engagement_targets  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagement_posts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagement_comments ENABLE ROW LEVEL SECURITY;

-- ---- engagement_targets ----

CREATE POLICY "Users can view engagement targets in their workspaces"
ON public.engagement_targets FOR SELECT TO authenticated
USING (public.user_has_workspace_access(workspace_id));

CREATE POLICY "Workspace admins can create engagement targets"
ON public.engagement_targets FOR INSERT TO authenticated
WITH CHECK (public.user_can_create_in_workspace(workspace_id));

CREATE POLICY "Workspace admins can update engagement targets"
ON public.engagement_targets FOR UPDATE TO authenticated
USING (public.user_can_create_in_workspace(workspace_id))
WITH CHECK (public.user_can_create_in_workspace(workspace_id));

CREATE POLICY "Workspace admins can delete engagement targets"
ON public.engagement_targets FOR DELETE TO authenticated
USING (public.user_can_create_in_workspace(workspace_id));

-- ---- engagement_posts ----

CREATE POLICY "Users can view engagement posts in their workspaces"
ON public.engagement_posts FOR SELECT TO authenticated
USING (public.user_has_workspace_access(workspace_id));

CREATE POLICY "Workspace admins can create engagement posts"
ON public.engagement_posts FOR INSERT TO authenticated
WITH CHECK (public.user_can_create_in_workspace(workspace_id));

CREATE POLICY "Workspace admins can update engagement posts"
ON public.engagement_posts FOR UPDATE TO authenticated
USING (public.user_can_create_in_workspace(workspace_id))
WITH CHECK (public.user_can_create_in_workspace(workspace_id));

-- ---- engagement_comments ----

CREATE POLICY "Users can view engagement comments in their workspaces"
ON public.engagement_comments FOR SELECT TO authenticated
USING (public.user_has_workspace_access(workspace_id));

CREATE POLICY "Workspace admins can create engagement comments"
ON public.engagement_comments FOR INSERT TO authenticated
WITH CHECK (public.user_can_create_in_workspace(workspace_id));

CREATE POLICY "Workspace admins can update engagement comments"
ON public.engagement_comments FOR UPDATE TO authenticated
USING (public.user_can_create_in_workspace(workspace_id))
WITH CHECK (public.user_can_create_in_workspace(workspace_id));


-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX idx_engagement_targets_workspace   ON public.engagement_targets(workspace_id);
CREATE INDEX idx_engagement_targets_publisher   ON public.engagement_targets(workspace_id, publisher_id);
CREATE INDEX idx_engagement_targets_active      ON public.engagement_targets(workspace_id, publisher_id, is_active) WHERE is_active = true;

CREATE INDEX idx_engagement_posts_workspace     ON public.engagement_posts(workspace_id);
CREATE INDEX idx_engagement_posts_target        ON public.engagement_posts(target_id);
CREATE INDEX idx_engagement_posts_published     ON public.engagement_posts(target_id, published_at DESC);

CREATE INDEX idx_engagement_comments_workspace  ON public.engagement_comments(workspace_id);
CREATE INDEX idx_engagement_comments_post       ON public.engagement_comments(post_id);
CREATE INDEX idx_engagement_comments_status     ON public.engagement_comments(workspace_id, status);


-- =============================================================================
-- TRIGGERS
-- =============================================================================

CREATE TRIGGER update_engagement_targets_updated_at
  BEFORE UPDATE ON public.engagement_targets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_engagement_comments_updated_at
  BEFORE UPDATE ON public.engagement_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
