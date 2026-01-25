-- Create linkedin_posts table to store fetched LinkedIn posts with analytics
CREATE TABLE public.linkedin_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid NOT NULL REFERENCES publishers(id) ON DELETE CASCADE,
  linkedin_post_urn text NOT NULL,
  content text,
  published_at timestamptz,
  impressions integer DEFAULT 0,
  reactions integer DEFAULT 0,
  comments integer DEFAULT 0,
  reshares integer DEFAULT 0,
  engagement_rate numeric(5,2),
  fetched_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(publisher_id, linkedin_post_urn)
);

-- Enable RLS
ALTER TABLE public.linkedin_posts ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can view linkedin posts (for dashboard display)
CREATE POLICY "Anyone can view linkedin posts"
  ON public.linkedin_posts FOR SELECT USING (true);

-- Policy: Users can manage their own publisher's posts
CREATE POLICY "Users can manage own publisher posts"
  ON public.linkedin_posts FOR ALL
  USING (
    publisher_id IN (
      SELECT id FROM publishers WHERE user_id = auth.uid()
    ) OR has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    publisher_id IN (
      SELECT id FROM publishers WHERE user_id = auth.uid()
    ) OR has_role(auth.uid(), 'admin'::app_role)
  );