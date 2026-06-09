-- Add separate title and company_name columns to engagement_targets
ALTER TABLE public.engagement_targets
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS company_name TEXT;
