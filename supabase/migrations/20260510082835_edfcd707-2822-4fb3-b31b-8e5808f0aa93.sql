ALTER TABLE public.workspaces
ADD COLUMN IF NOT EXISTS slack_webhook_url text;