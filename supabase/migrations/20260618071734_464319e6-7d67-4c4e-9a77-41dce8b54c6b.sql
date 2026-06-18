-- Add email column to workspace_members for display purposes
ALTER TABLE public.workspace_members ADD COLUMN IF NOT EXISTS email TEXT;

-- Backfill existing members from auth.users
UPDATE public.workspace_members wm
SET email = au.email
FROM auth.users au
WHERE wm.user_id = au.id
  AND wm.email IS NULL;

-- Update existing RLS policies to account for new column (no change needed, email is just display data)

-- Helper function to sync member email on upsert (optional, used by edge functions)
CREATE OR REPLACE FUNCTION public.sync_workspace_member_email(_user_id uuid, _email text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.workspace_members
  SET email = _email
  WHERE user_id = _user_id AND email IS DISTINCT FROM _email;
$$;