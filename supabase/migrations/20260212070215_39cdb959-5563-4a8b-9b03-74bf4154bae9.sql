
-- Add media_url column to posts table
ALTER TABLE public.posts ADD COLUMN media_url text;

-- Create post-media storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('post-media', 'post-media', true);

-- Anyone can view post media
CREATE POLICY "Anyone can view post media"
ON storage.objects FOR SELECT
USING (bucket_id = 'post-media');

-- Authenticated users can upload post media
CREATE POLICY "Authenticated users can upload post media"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'post-media' AND auth.role() = 'authenticated');

-- Authenticated users can update their post media
CREATE POLICY "Authenticated users can update post media"
ON storage.objects FOR UPDATE
USING (bucket_id = 'post-media' AND auth.role() = 'authenticated');

-- Authenticated users can delete post media
CREATE POLICY "Authenticated users can delete post media"
ON storage.objects FOR DELETE
USING (bucket_id = 'post-media' AND auth.role() = 'authenticated');
