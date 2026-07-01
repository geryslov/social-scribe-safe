
CREATE TABLE public.engagement_auto_like_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  publisher_id UUID NOT NULL REFERENCES public.publishers(id) ON DELETE CASCADE,
  target_id UUID REFERENCES public.engagement_targets(id) ON DELETE SET NULL,
  target_name TEXT,
  post_id UUID REFERENCES public.engagement_posts(id) ON DELETE SET NULL,
  post_url TEXT,
  post_excerpt TEXT,
  status TEXT NOT NULL CHECK (status IN ('liked','skipped_cap','skipped_already','failed')),
  error_message TEXT,
  trigger TEXT NOT NULL DEFAULT 'cron',
  run_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.engagement_auto_like_runs TO authenticated;
GRANT ALL ON public.engagement_auto_like_runs TO service_role;

ALTER TABLE public.engagement_auto_like_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view auto-like runs"
  ON public.engagement_auto_like_runs
  FOR SELECT TO authenticated
  USING (public.user_has_workspace_access(workspace_id));

CREATE INDEX idx_auto_like_runs_ws_pub_time
  ON public.engagement_auto_like_runs (workspace_id, publisher_id, run_at DESC);

CREATE INDEX idx_auto_like_runs_target_time
  ON public.engagement_auto_like_runs (target_id, run_at DESC);
