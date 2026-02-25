
-- Create post_reactors table
CREATE TABLE public.post_reactors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  actor_urn TEXT NOT NULL,
  actor_name TEXT NOT NULL DEFAULT 'LinkedIn Member',
  actor_headline TEXT,
  actor_profile_url TEXT,
  reaction_type TEXT NOT NULL,
  reacted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(post_id, actor_urn)
);

-- Enable RLS
ALTER TABLE public.post_reactors ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Anyone can view post reactors"
  ON public.post_reactors FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert post reactors"
  ON public.post_reactors FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update post reactors"
  ON public.post_reactors FOR UPDATE
  USING (true);

-- Index for fast lookups
CREATE INDEX idx_post_reactors_post_id ON public.post_reactors(post_id);

-- Add missing columns to post_comments
ALTER TABLE public.post_comments
  ADD COLUMN IF NOT EXISTS author_headline TEXT,
  ADD COLUMN IF NOT EXISTS author_profile_url TEXT;
