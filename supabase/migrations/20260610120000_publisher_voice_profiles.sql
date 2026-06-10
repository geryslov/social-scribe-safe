-- Add voice profile columns to publishers
ALTER TABLE public.publishers
  ADD COLUMN IF NOT EXISTS voice_profile TEXT,
  ADD COLUMN IF NOT EXISTS voice_profile_generated_at TIMESTAMPTZ;
