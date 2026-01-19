-- Add LinkedIn OAuth columns to publishers table
ALTER TABLE public.publishers
ADD COLUMN linkedin_access_token text,
ADD COLUMN linkedin_refresh_token text,
ADD COLUMN linkedin_token_expires_at timestamp with time zone,
ADD COLUMN linkedin_member_id text,
ADD COLUMN linkedin_connected boolean DEFAULT false;

-- Add LinkedIn tracking columns to posts table
ALTER TABLE public.posts
ADD COLUMN published_at timestamp with time zone,
ADD COLUMN linkedin_post_url text,
ADD COLUMN publish_method text;