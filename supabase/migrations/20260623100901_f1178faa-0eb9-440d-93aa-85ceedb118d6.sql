ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS publisher_ids UUID[] NOT NULL DEFAULT '{}';