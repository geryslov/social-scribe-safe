-- Track engagement on comments we posted
ALTER TABLE public.engagement_comments
  ADD COLUMN IF NOT EXISTS reaction_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reply_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reactions_breakdown JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS engagement_fetched_at TIMESTAMPTZ;
