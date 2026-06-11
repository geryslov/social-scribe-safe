ALTER TABLE public.engagement_comments
  ADD COLUMN IF NOT EXISTS reaction_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reply_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reactions_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS engagement_fetched_at timestamptz;