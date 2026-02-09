
CREATE TABLE public.follower_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid NOT NULL REFERENCES public.publishers(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  follower_count integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(publisher_id, snapshot_date)
);

ALTER TABLE public.follower_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view follower history" ON public.follower_history FOR SELECT USING (true);
CREATE POLICY "Anyone can insert follower history" ON public.follower_history FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update follower history" ON public.follower_history FOR UPDATE USING (true);
