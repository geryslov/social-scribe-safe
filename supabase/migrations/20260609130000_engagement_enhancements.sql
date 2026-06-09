-- =============================================================================
-- Engagement Enhancements
-- 1. Add last_seen_at to engagement_targets (for unseen post badges)
-- 2. Add is_commented to engagement_posts (label commented posts)
-- =============================================================================

-- Track when user last viewed a target's posts
ALTER TABLE public.engagement_targets
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

-- Track whether we've commented on a post
ALTER TABLE public.engagement_posts
  ADD COLUMN IF NOT EXISTS is_commented BOOLEAN NOT NULL DEFAULT false;

-- Index for unseen posts query (posts newer than last_seen_at)
CREATE INDEX IF NOT EXISTS idx_engagement_posts_created_at
  ON public.engagement_posts(target_id, created_at DESC);
