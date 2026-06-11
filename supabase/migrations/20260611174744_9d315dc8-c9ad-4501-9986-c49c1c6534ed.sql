
CREATE TABLE public.comment_reactors (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  engagement_comment_id uuid NOT NULL REFERENCES public.engagement_comments(id) ON DELETE CASCADE,
  actor_urn text NOT NULL,
  actor_name text NOT NULL DEFAULT 'LinkedIn member',
  actor_headline text,
  actor_profile_url text,
  actor_avatar_url text,
  reaction_type text NOT NULL DEFAULT 'LIKE',
  reacted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (engagement_comment_id, actor_urn)
);
CREATE INDEX idx_comment_reactors_comment ON public.comment_reactors(engagement_comment_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comment_reactors TO authenticated;
GRANT ALL ON public.comment_reactors TO service_role;
ALTER TABLE public.comment_reactors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view comment reactors" ON public.comment_reactors FOR SELECT TO authenticated USING (user_has_workspace_access(workspace_id));
CREATE POLICY "Creators manage comment reactors" ON public.comment_reactors FOR ALL TO authenticated USING (user_can_create_in_workspace(workspace_id)) WITH CHECK (user_can_create_in_workspace(workspace_id));

CREATE TABLE public.comment_replies (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  engagement_comment_id uuid NOT NULL REFERENCES public.engagement_comments(id) ON DELETE CASCADE,
  reply_urn text NOT NULL,
  actor_urn text NOT NULL,
  actor_name text NOT NULL DEFAULT 'LinkedIn member',
  actor_headline text,
  actor_profile_url text,
  actor_avatar_url text,
  reply_text text,
  replied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (engagement_comment_id, reply_urn)
);
CREATE INDEX idx_comment_replies_comment ON public.comment_replies(engagement_comment_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comment_replies TO authenticated;
GRANT ALL ON public.comment_replies TO service_role;
ALTER TABLE public.comment_replies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view comment replies" ON public.comment_replies FOR SELECT TO authenticated USING (user_has_workspace_access(workspace_id));
CREATE POLICY "Creators manage comment replies" ON public.comment_replies FOR ALL TO authenticated USING (user_can_create_in_workspace(workspace_id)) WITH CHECK (user_can_create_in_workspace(workspace_id));
