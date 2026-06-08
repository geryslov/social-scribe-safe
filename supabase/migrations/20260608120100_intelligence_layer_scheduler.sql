-- =============================================================================
-- Intelligence Layer — Scheduled Research via pg_cron + pg_net
--
-- Creates a cron job that fires twice daily (8am and 4pm UTC).
-- For each workspace with schedule_enabled = true, and for each publisher with
-- active monitoring topics, it invokes the run-research Edge Function via
-- pg_net HTTP POST.
--
-- The job respects workspace_research_settings.schedule_frequency:
--   - 'daily'       → runs only on the 8am invocation
--   - 'twice_daily' → runs on both 8am and 4pm
-- =============================================================================

-- Enable required extensions (both available on Supabase by default)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ---------------------------------------------------------------------------
-- Dispatcher function: called by pg_cron, iterates workspaces → publishers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dispatch_scheduled_research()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  fn_url  text := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url')
                  || '/functions/v1/run-research';
  svc_key text := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key');
  current_hour int := EXTRACT(HOUR FROM now() AT TIME ZONE 'UTC');
  is_morning   boolean := current_hour < 12;
  rec          record;
BEGIN
  -- If vault secrets aren't set, fall back to env (works on most Supabase projects)
  IF fn_url IS NULL OR fn_url = '' THEN
    fn_url := current_setting('app.settings.supabase_url', true)
              || '/functions/v1/run-research';
  END IF;
  IF svc_key IS NULL OR svc_key = '' THEN
    svc_key := current_setting('app.settings.service_role_key', true);
  END IF;

  -- Bail out if we still can't resolve the URL
  IF fn_url IS NULL OR svc_key IS NULL THEN
    RAISE WARNING 'dispatch_scheduled_research: missing supabase_url or service_role_key';
    RETURN;
  END IF;

  FOR rec IN
    SELECT DISTINCT
      wrs.workspace_id,
      mt.publisher_id
    FROM workspace_research_settings wrs
    JOIN monitoring_topics mt
      ON mt.workspace_id = wrs.workspace_id
      AND mt.is_active = true
    WHERE wrs.schedule_enabled = true
      -- Respect frequency: daily only runs in the morning window
      AND (wrs.schedule_frequency = 'twice_daily' OR is_morning)
  LOOP
    -- Fire-and-forget HTTP POST to the Edge Function
    PERFORM net.http_post(
      url     := fn_url,
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || svc_key
      ),
      body    := jsonb_build_object(
        'workspace_id',  rec.workspace_id,
        'publisher_id',  rec.publisher_id,
        'trigger_type',  'scheduled'
      )
    );
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- Cron jobs: 8:00 UTC and 16:00 UTC daily
-- ---------------------------------------------------------------------------
SELECT cron.schedule(
  'intelligence-research-morning',
  '0 8 * * *',
  $$SELECT public.dispatch_scheduled_research()$$
);

SELECT cron.schedule(
  'intelligence-research-afternoon',
  '0 16 * * *',
  $$SELECT public.dispatch_scheduled_research()$$
);
