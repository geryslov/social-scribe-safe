ALTER TABLE public.engagement_posts
  ADD COLUMN IF NOT EXISTS is_commented boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_liked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS liked_at timestamp with time zone;