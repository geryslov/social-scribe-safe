CREATE OR REPLACE FUNCTION public.notify_slack_on_reaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
      'actor_urn', NEW.actor_urn,
      'actor_name', NEW.actor_name,
      'actor_headline', NEW.actor_headline,
      'actor_profile_url', NEW.actor_profile_url,
      'reaction_type', NEW.reaction_type
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$function$;