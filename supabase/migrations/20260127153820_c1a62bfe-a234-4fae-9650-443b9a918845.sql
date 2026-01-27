-- Create workspaces table
CREATE TABLE public.workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  
  -- Invite token for this workspace
  invite_token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  invite_enabled BOOLEAN DEFAULT true,
  
  -- Branding
  company_name TEXT,
  logo_url TEXT,
  description TEXT,
  theme JSONB DEFAULT '{}',
  
  -- Flags
  is_test_workspace BOOLEAN DEFAULT false,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Create workspace_members table
CREATE TABLE public.workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  joined_via TEXT DEFAULT 'invite_link',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(workspace_id, user_id)
);

-- Add workspace_id to publishers
ALTER TABLE public.publishers 
ADD COLUMN workspace_id UUID REFERENCES workspaces(id);

-- Add workspace_id to posts
ALTER TABLE public.posts 
ADD COLUMN workspace_id UUID REFERENCES workspaces(id);

-- Add workspace_id to documents
ALTER TABLE public.documents 
ADD COLUMN workspace_id UUID REFERENCES workspaces(id);

-- Enable RLS on new tables
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

-- Create security definer function for workspace access
CREATE OR REPLACE FUNCTION public.user_has_workspace_access(_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
  ) OR EXISTS (
    SELECT 1 FROM workspace_members 
    WHERE user_id = auth.uid() AND workspace_id = _workspace_id
  )
$$;

-- Workspace policies
CREATE POLICY "Users see their workspaces"
ON workspaces FOR SELECT
USING (
  has_role(auth.uid(), 'admin') 
  OR id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  OR invite_enabled = true
);

CREATE POLICY "Admins can create workspaces"
ON workspaces FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update workspaces"
ON workspaces FOR UPDATE
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete workspaces"
ON workspaces FOR DELETE
USING (has_role(auth.uid(), 'admin'));

-- Workspace members policies
CREATE POLICY "Users see members in their workspaces"
ON workspace_members FOR SELECT
USING (user_has_workspace_access(workspace_id));

CREATE POLICY "Admins can manage workspace members"
ON workspace_members FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- Update publishers policy to include workspace filtering
DROP POLICY IF EXISTS "Anyone can view publishers" ON publishers;
CREATE POLICY "Users see publishers in their workspaces"
ON publishers FOR SELECT
USING (
  workspace_id IS NULL
  OR user_has_workspace_access(workspace_id)
);

-- Update posts policy to include workspace filtering
DROP POLICY IF EXISTS "Anyone can view posts" ON posts;
CREATE POLICY "Users see posts in their workspaces"
ON posts FOR SELECT
USING (
  workspace_id IS NULL
  OR user_has_workspace_access(workspace_id)
);

-- Update documents policy to include workspace filtering
DROP POLICY IF EXISTS "Anyone can view documents" ON documents;
CREATE POLICY "Users see documents in their workspaces"
ON documents FOR SELECT
USING (
  workspace_id IS NULL
  OR user_has_workspace_access(workspace_id)
);

-- Add trigger for updated_at on workspaces
CREATE TRIGGER update_workspaces_updated_at
BEFORE UPDATE ON public.workspaces
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();