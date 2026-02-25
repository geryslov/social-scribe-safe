-- Add avatar URL column to post_reactors
ALTER TABLE public.post_reactors ADD COLUMN IF NOT EXISTS actor_avatar_url text;

-- Add avatar URL column to post_comments for commenter profile pics
ALTER TABLE public.post_comments ADD COLUMN IF NOT EXISTS author_avatar_url text;