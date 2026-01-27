-- Add company info and headline columns to publishers table
ALTER TABLE public.publishers ADD COLUMN IF NOT EXISTS headline TEXT;
ALTER TABLE public.publishers ADD COLUMN IF NOT EXISTS company_name TEXT;
ALTER TABLE public.publishers ADD COLUMN IF NOT EXISTS company_logo_url TEXT;
ALTER TABLE public.publishers ADD COLUMN IF NOT EXISTS managed_organizations JSONB;