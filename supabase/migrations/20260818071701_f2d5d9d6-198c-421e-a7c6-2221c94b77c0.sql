select cron.unschedule('sync-target-comments-daily') where exists (select 1 from cron.job where jobname='sync-target-comments-daily');
select cron.schedule(
  'sync-target-comments-daily',
  '35 6 * * *',
  $$
  select net.http_post(
    url := 'https://vstuoqlvakfvrowpxsae.supabase.co/functions/v1/sync-target-comments',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzdHVvcWx2YWtmdnJvd3B4c2FlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4MjA2NjksImV4cCI6MjA4NDM5NjY2OX0.iRhYp6CBAld3KwqzpWMs5-CKTaAXcb9AFdwbmL15QWc"}'::jsonb,
    body := '{"trigger":"cron"}'::jsonb
  );
  $$
);