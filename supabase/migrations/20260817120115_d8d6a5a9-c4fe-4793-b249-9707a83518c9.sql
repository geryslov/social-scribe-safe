select cron.unschedule('run-auto-likes-hourly') where exists (select 1 from cron.job where jobname = 'run-auto-likes-hourly');

select cron.schedule(
  'run-auto-likes-hourly',
  '20 6-12 * * *',
  $$
  select net.http_post(
    url := 'https://vstuoqlvakfvrowpxsae.supabase.co/functions/v1/run-auto-likes',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzdHVvcWx2YWtmdnJvd3B4c2FlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4MjA2NjksImV4cCI6MjA4NDM5NjY2OX0.iRhYp6CBAld3KwqzpWMs5-CKTaAXcb9AFdwbmL15QWc"}'::jsonb,
    body := jsonb_build_object('triggered_at', now())
  );
  $$
);