
CREATE TABLE public.engagement_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  publisher_id UUID NOT NULL REFERENCES public.publishers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  linkedin_url TEXT NOT NULL,
  linkedin_username TEXT,
  headline TEXT,
  avatar_url TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_fetched_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.engagement_targets TO authenticated;
GRANT ALL ON public.engagement_targets TO service_role;
ALTER TABLE public.engagement_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view targets" ON public.engagement_targets FOR SELECT TO authenticated
  USING (public.user_has_workspace_access(workspace_id));
CREATE POLICY "Creators insert targets" ON public.engagement_targets FOR INSERT TO authenticated
  WITH CHECK (public.user_can_create_in_workspace(workspace_id));
CREATE POLICY "Creators update targets" ON public.engagement_targets FOR UPDATE TO authenticated
  USING (public.user_can_create_in_workspace(workspace_id))
  WITH CHECK (public.user_can_create_in_workspace(workspace_id));
CREATE POLICY "Creators delete targets" ON public.engagement_targets FOR DELETE TO authenticated
  USING (public.user_can_create_in_workspace(workspace_id));
CREATE TRIGGER engagement_targets_updated_at BEFORE UPDATE ON public.engagement_targets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_engagement_targets_workspace ON public.engagement_targets(workspace_id, publisher_id);

CREATE TABLE public.engagement_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES public.engagement_targets(id) ON DELETE CASCADE,
  linkedin_post_urn TEXT,
  linkedin_post_url TEXT NOT NULL,
  content TEXT,
  published_at TIMESTAMPTZ,
  likes_count INTEGER NOT NULL DEFAULT 0,
  comments_count INTEGER NOT NULL DEFAULT 0,
  shares_count INTEGER NOT NULL DEFAULT 0,
  post_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (target_id, linkedin_post_urn)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.engagement_posts TO authenticated;
GRANT ALL ON public.engagement_posts TO service_role;
ALTER TABLE public.engagement_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view eposts" ON public.engagement_posts FOR SELECT TO authenticated
  USING (public.user_has_workspace_access(workspace_id));
CREATE POLICY "Creators insert eposts" ON public.engagement_posts FOR INSERT TO authenticated
  WITH CHECK (public.user_can_create_in_workspace(workspace_id));
CREATE POLICY "Creators update eposts" ON public.engagement_posts FOR UPDATE TO authenticated
  USING (public.user_can_create_in_workspace(workspace_id))
  WITH CHECK (public.user_can_create_in_workspace(workspace_id));
CREATE POLICY "Creators delete eposts" ON public.engagement_posts FOR DELETE TO authenticated
  USING (public.user_can_create_in_workspace(workspace_id));
CREATE TRIGGER engagement_posts_updated_at BEFORE UPDATE ON public.engagement_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_engagement_posts_target ON public.engagement_posts(target_id, published_at DESC);

CREATE TABLE public.engagement_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  publisher_id UUID NOT NULL REFERENCES public.publishers(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES public.engagement_posts(id) ON DELETE CASCADE,
  comment_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  linkedin_comment_urn TEXT,
  posted_at TIMESTAMPTZ,
  error_message TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.engagement_comments TO authenticated;
GRANT ALL ON public.engagement_comments TO service_role;
ALTER TABLE public.engagement_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view ecomments" ON public.engagement_comments FOR SELECT TO authenticated
  USING (public.user_has_workspace_access(workspace_id));
CREATE POLICY "Creators insert ecomments" ON public.engagement_comments FOR INSERT TO authenticated
  WITH CHECK (public.user_can_create_in_workspace(workspace_id));
CREATE POLICY "Creators update ecomments" ON public.engagement_comments FOR UPDATE TO authenticated
  USING (public.user_can_create_in_workspace(workspace_id))
  WITH CHECK (public.user_can_create_in_workspace(workspace_id));
CREATE POLICY "Creators delete ecomments" ON public.engagement_comments FOR DELETE TO authenticated
  USING (public.user_can_create_in_workspace(workspace_id));
CREATE TRIGGER engagement_comments_updated_at BEFORE UPDATE ON public.engagement_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_engagement_comments_post ON public.engagement_comments(post_id, created_at DESC);
