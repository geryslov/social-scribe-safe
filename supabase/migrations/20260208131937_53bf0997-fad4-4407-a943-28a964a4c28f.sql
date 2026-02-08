
ALTER TABLE public.publishers ADD COLUMN profile_viewers integer DEFAULT 0;
ALTER TABLE public.publishers ADD COLUMN followers_count integer DEFAULT 0;
ALTER TABLE public.publishers ADD COLUMN search_appearances integer DEFAULT 0;
ALTER TABLE public.publishers ADD COLUMN profile_analytics_fetched_at timestamptz;
