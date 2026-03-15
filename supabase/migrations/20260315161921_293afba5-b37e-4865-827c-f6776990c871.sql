-- Create secure token storage table
CREATE TABLE public.publisher_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid NOT NULL REFERENCES public.publishers(id) ON DELETE CASCADE,
  linkedin_access_token text,
  linkedin_refresh_token text,
  linkedin_token_expires_at timestamptz,
  updated_at timestamptz DEFAULT now(),
  UNIQUE (publisher_id)
);

ALTER TABLE public.publisher_tokens ENABLE ROW LEVEL SECURITY;

-- No RLS policies for regular users - only service_role can access this table
-- Edge functions use service_role key so they can read/write freely

-- Migrate existing token data
INSERT INTO public.publisher_tokens (publisher_id, linkedin_access_token, linkedin_refresh_token, linkedin_token_expires_at)
SELECT id, linkedin_access_token, linkedin_refresh_token, linkedin_token_expires_at
FROM public.publishers
WHERE linkedin_access_token IS NOT NULL;

-- Clear tokens from publishers table
UPDATE public.publishers SET 
  linkedin_access_token = NULL,
  linkedin_refresh_token = NULL,
  linkedin_token_expires_at = NULL;