-- Track the publishers a document targets so newly-split sections can be
-- pre-assigned without forcing the user to pick again.
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS publisher_ids UUID[] NOT NULL DEFAULT '{}';
