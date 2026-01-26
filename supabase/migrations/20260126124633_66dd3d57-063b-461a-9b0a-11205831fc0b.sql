-- Add unique_impressions column to store MEMBERS_REACHED metric
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS unique_impressions integer DEFAULT 0;