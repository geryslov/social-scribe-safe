
CREATE TABLE IF NOT EXISTS public.workspace_engagement_settings (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  auto_sync_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_engagement_settings TO authenticated;
GRANT ALL ON public.workspace_engagement_settings TO service_role;

ALTER TABLE public.workspace_engagement_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read engagement settings"
ON public.workspace_engagement_settings FOR SELECT TO authenticated
USING (public.user_has_workspace_access(workspace_id));

CREATE POLICY "members write engagement settings"
ON public.workspace_engagement_settings FOR ALL TO authenticated
USING (public.user_can_create_in_workspace(workspace_id))
WITH CHECK (public.user_can_create_in_workspace(workspace_id));

CREATE TABLE IF NOT EXISTS public.engagement_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  total_targets int NOT NULL DEFAULT 0,
  synced int NOT NULL DEFAULT 0,
  skipped int NOT NULL DEFAULT 0,
  failed int NOT NULL DEFAULT 0,
  new_posts int NOT NULL DEFAULT 0,
  trigger text NOT NULL DEFAULT 'cron',
  details jsonb
);

CREATE INDEX IF NOT EXISTS engagement_sync_runs_ws_started_idx
  ON public.engagement_sync_runs(workspace_id, started_at DESC);

GRANT SELECT, INSERT ON public.engagement_sync_runs TO authenticated;
GRANT ALL ON public.engagement_sync_runs TO service_role;

ALTER TABLE public.engagement_sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read engagement sync runs"
ON public.engagement_sync_runs FOR SELECT TO authenticated
USING (workspace_id IS NULL OR public.user_has_workspace_access(workspace_id));
