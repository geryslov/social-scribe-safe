-- Add analytics columns to posts table for tracking LinkedIn post metrics
ALTER TABLE public.posts 
ADD COLUMN IF NOT EXISTS linkedin_post_urn text,
ADD COLUMN IF NOT EXISTS impressions integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS reactions integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS comments_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS reshares integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS engagement_rate numeric,
ADD COLUMN IF NOT EXISTS analytics_fetched_at timestamp with time zone;

-- Create index for faster lookups of posts with LinkedIn URNs
CREATE INDEX IF NOT EXISTS idx_posts_linkedin_post_urn ON public.posts(linkedin_post_urn) WHERE linkedin_post_urn IS NOT NULL;