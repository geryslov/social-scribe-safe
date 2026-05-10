-- Enable pg_net for HTTP calls from triggers
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.notify_slack_on_reaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fn_url text := 'https://vstuoqlvakfvrowpxsae.supabase.co/functions/v1/notify-slack-reaction';
  anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzdHVvcWx2YWtmdnJvd3B4c2FlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4MjA2NjksImV4cCI6MjA4NDM5NjY2OX0.iRhYp6CBAld3KwqzpWMs5-CKTaAXcb9AFdwbmL15QWc';
BEGIN
  PERFORM extensions.http_post(
    url := fn_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || anon_key
    ),
    body := jsonb_build_object(
      'post_id', NEW.post_id,
      'actor_name', NEW.actor_name,
      'actor_headline', NEW.actor_headline,
      'actor_profile_url', NEW.actor_profile_url,
      'reaction_type', NEW.reaction_type
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block the insert if Slack notification fails
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_slack_on_reaction ON public.post_reactors;
CREATE TRIGGER trg_notify_slack_on_reaction
AFTER INSERT ON public.post_reactors
FOR EACH ROW
EXECUTE FUNCTION public.notify_slack_on_reaction();