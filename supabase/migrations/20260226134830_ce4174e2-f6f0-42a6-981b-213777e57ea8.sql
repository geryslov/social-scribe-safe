
-- Add paid/sponsored analytics columns to posts table
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS is_sponsored boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS paid_impressions integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_clicks integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_reactions integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_comments integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_reshares integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ad_spend numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ad_account_id text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ad_campaign_id text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ad_creative_id text DEFAULT NULL;
