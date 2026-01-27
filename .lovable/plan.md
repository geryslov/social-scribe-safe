

# Plan: Workspace Invite Link System

## Overview

Instead of pre-registering LinkedIn profile URLs, admins will generate unique invite links for each workspace. Publishers click the link and are automatically assigned to the correct workspace when they log in via LinkedIn SSO.

---

## How It Works

```text
ADMIN FLOW:
┌─────────────────────────────────────────────────────────────────┐
│  WORKSPACE: TechCorp                                            │
│                                                                 │
│  Invite Link:                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ https://yourapp.com/join/abc123xyz                 [📋] │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  [🔄 Regenerate Link]  [⚙️ Link Settings]                       │
└─────────────────────────────────────────────────────────────────┘

PUBLISHER FLOW:
Publisher receives invite link
              │
              ▼
   ┌─────────────────────────────┐
   │ Click: yourapp.com/join/    │
   │        abc123xyz            │
   └─────────────────────────────┘
              │
              ▼
   ┌─────────────────────────────┐
   │ Join page shows:            │
   │ "Join TechCorp Workspace"   │
   │ [Sign in with LinkedIn]     │
   └─────────────────────────────┘
              │
              ▼
   ┌─────────────────────────────┐
   │ LinkedIn SSO with invite    │
   │ token in state              │
   └─────────────────────────────┘
              │
              ▼
   ┌─────────────────────────────┐
   │ Edge function:              │
   │ 1. Validate invite token    │
   │ 2. Create user/publisher    │
   │ 3. Assign to workspace      │
   │ 4. Redirect to workspace    │
   └─────────────────────────────┘
```

---

## Database Schema

### New Table: `workspaces`

```sql
CREATE TABLE workspaces (
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
```

### New Table: `workspace_members`

```sql
CREATE TABLE workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',  -- 'owner', 'admin', 'member'
  joined_via TEXT DEFAULT 'invite_link', -- 'invite_link', 'manual', 'owner'
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(workspace_id, user_id)
);
```

### Modified Table: `publishers`

```sql
ALTER TABLE publishers 
ADD COLUMN workspace_id UUID REFERENCES workspaces(id);
```

### Modified Table: `posts`

```sql
ALTER TABLE posts 
ADD COLUMN workspace_id UUID REFERENCES workspaces(id);
```

### Modified Table: `documents`

```sql
ALTER TABLE documents 
ADD COLUMN workspace_id UUID REFERENCES workspaces(id);
```

---

## RLS Policies

### Security Definer Function

```sql
CREATE OR REPLACE FUNCTION public.user_has_workspace_access(_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    -- Global admins have access to all workspaces
    SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
  ) OR EXISTS (
    -- Members have access to their specific workspaces
    SELECT 1 FROM workspace_members 
    WHERE user_id = auth.uid() AND workspace_id = _workspace_id
  )
$$;
```

### Workspace Policies

```sql
-- Workspaces: only see your own (or all if admin)
CREATE POLICY "Users see their workspaces"
ON workspaces FOR SELECT
USING (
  has_role(auth.uid(), 'admin') 
  OR id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
);

-- Allow public read of workspace name for invite pages (by token)
CREATE POLICY "Anyone can read workspace by invite token"
ON workspaces FOR SELECT
USING (invite_enabled = true);
```

### Data Isolation Policies

```sql
-- Publishers: only see those in your workspace
CREATE POLICY "Users see publishers in their workspaces"
ON publishers FOR SELECT
USING (
  workspace_id IS NULL  -- Legacy data visible to admins
  OR user_has_workspace_access(workspace_id)
);

-- Posts: only see those in your workspace
CREATE POLICY "Users see posts in their workspaces"
ON posts FOR SELECT
USING (
  workspace_id IS NULL
  OR user_has_workspace_access(workspace_id)
);

-- Documents: only see those in your workspace
CREATE POLICY "Users see documents in their workspaces"
ON documents FOR SELECT
USING (
  workspace_id IS NULL
  OR user_has_workspace_access(workspace_id)
);
```

---

## SSO Flow with Invite Token

### Updated Edge Function Logic

The `linkedin-auth` edge function will be modified to:

1. Accept an optional `invite` parameter in the state
2. Validate the invite token against the `workspaces` table
3. Assign the user to the workspace upon successful login

```typescript
// In start-sso endpoint
const inviteToken = url.searchParams.get('invite');
const returnUrl = url.searchParams.get('return_url') || '/';

// Include invite token in state
const state = btoa(JSON.stringify({ 
  type: 'sso', 
  returnUrl,
  inviteToken: inviteToken || null 
}));

// In callback-sso endpoint
const { inviteToken } = stateData;

if (inviteToken) {
  // Look up workspace by invite token
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id, name, slug, invite_enabled')
    .eq('invite_token', inviteToken)
    .eq('invite_enabled', true)
    .single();
    
  if (!workspace) {
    return errorResponse('Invalid or expired invite link');
  }
  
  // Create publisher in this workspace
  await supabase.from('publishers').insert({
    name: name,
    user_id: userId,
    workspace_id: workspace.id,  // Auto-assign!
    // ... other fields
  });
  
  // Add to workspace_members
  await supabase.from('workspace_members').insert({
    workspace_id: workspace.id,
    user_id: userId,
    role: 'member',
    joined_via: 'invite_link',
  });
  
  // Redirect to the workspace
  returnUrl = `/w/${workspace.slug}/`;
}
```

---

## New Routes

| Route | Purpose |
|-------|---------|
| `/join/:token` | Invite landing page - shows workspace name and login button |
| `/w/:slug/` | Workspace-scoped Analytics |
| `/w/:slug/posts` | Workspace-scoped Posts |
| `/w/:slug/documents` | Workspace-scoped Documents |
| `/w/:slug/settings` | Workspace settings (admins) |
| `/admin` | Global admin dashboard |

---

## New Components & Pages

### 1. Join Page (`src/pages/JoinWorkspace.tsx`)

Landing page for invite links:

```text
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│                      [WORKSPACE LOGO]                           │
│                                                                 │
│                 Join TechCorp Workspace                         │
│                                                                 │
│      You've been invited to collaborate on TechCorp's          │
│      LinkedIn content and analytics.                            │
│                                                                 │
│     ┌───────────────────────────────────────────────────┐      │
│     │  🔗  Sign in with LinkedIn                        │      │
│     └───────────────────────────────────────────────────┘      │
│                                                                 │
│            Already have an account? Sign in                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2. Workspace Switcher (`src/components/WorkspaceSwitcher.tsx`)

Dropdown in header:

```text
┌─────────────────────────────────┐
│ 🏢 TechCorp                  ▼ │
├─────────────────────────────────┤
│ ✓ TechCorp (current)           │
│   FinanceX                      │
│   ─────────────────             │
│ 🧪 Test Workspace               │
│   ─────────────────             │
│ ⚙️ Manage Workspaces (admin)   │
└─────────────────────────────────┘
```

### 3. Workspace Settings (`src/pages/WorkspaceSettings.tsx`)

```text
┌─────────────────────────────────────────────────────────────────┐
│  WORKSPACE SETTINGS: TechCorp                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  General                                                        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Name: TechCorp                                          │   │
│  │ Company: TechCorp Inc.                                  │   │
│  │ Logo: [Upload]                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Invite Link                                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ https://yourapp.com/join/abc123xyz              [📋]    │   │
│  │                                                         │   │
│  │ ○ Enabled  ○ Disabled                                   │   │
│  │                                                         │   │
│  │ [🔄 Regenerate Link]                                    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Members (3)                                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ [👤] Alice Johnson     Owner    ──────────              │   │
│  │ [👤] Bob Smith         Member   [Change Role] [Remove]  │   │
│  │ [👤] Charlie Dev       Member   [Change Role] [Remove]  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4. Admin Dashboard (`src/pages/AdminDashboard.tsx`)

Global view for you (super admin):

```text
┌─────────────────────────────────────────────────────────────────┐
│  ALL WORKSPACES                                  [+ Create New] │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────┐  ┌──────────────────────┐            │
│  │ TechCorp             │  │ FinanceX             │            │
│  │ 3 members            │  │ 2 members            │            │
│  │ 50 posts             │  │ 30 posts             │            │
│  │ [Enter] [Copy Link]  │  │ [Enter] [Copy Link]  │            │
│  └──────────────────────┘  └──────────────────────┘            │
│                                                                 │
│  ┌──────────────────────┐                                      │
│  │ 🧪 Test Workspace    │                                      │
│  │ 1 member             │                                      │
│  │ 10 posts             │                                      │
│  │ [Enter] [Copy Link]  │                                      │
│  └──────────────────────┘                                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| **Database Migration** | Create | Add `workspaces`, `workspace_members` tables; add `workspace_id` columns |
| **RLS Migration** | Create | Add security function and policies |
| `supabase/functions/linkedin-auth/index.ts` | Modify | Handle invite tokens in SSO flow |
| `src/pages/JoinWorkspace.tsx` | **NEW** | Invite landing page |
| `src/pages/AdminDashboard.tsx` | **NEW** | Global admin view |
| `src/pages/WorkspaceSettings.tsx` | **NEW** | Workspace configuration |
| `src/hooks/useWorkspace.tsx` | **NEW** | Workspace context provider |
| `src/hooks/useWorkspaces.tsx` | **NEW** | Workspace CRUD operations |
| `src/components/WorkspaceSwitcher.tsx` | **NEW** | Header dropdown |
| `src/components/CreateWorkspaceModal.tsx` | **NEW** | Modal to create workspace |
| `src/App.tsx` | Modify | Add workspace-aware routing |
| `src/components/Header.tsx` | Modify | Add workspace switcher |
| `src/hooks/usePosts.tsx` | Modify | Filter by current workspace |
| `src/hooks/usePublishers.tsx` | Modify | Filter by current workspace |
| `src/hooks/useDocuments.tsx` | Modify | Filter by current workspace |

---

## Invite Link Features

### Basic Features
- One invite link per workspace
- Link can be enabled/disabled
- Link can be regenerated (invalidates old link)

### Optional Enhancements (Future)
- Multiple invite links per workspace
- Expiring links (e.g., valid for 7 days)
- Usage limits (e.g., max 10 uses)
- Role-specific links (admin link vs member link)

---

## Data Migration Strategy

For existing data:
1. Create a "Default" workspace owned by you
2. Move all existing publishers/posts/documents to the Default workspace
3. Add existing users as members of the Default workspace
4. Create a "Test" workspace separately

---

## Summary

The invite link approach provides:

| Benefit | Description |
|---------|-------------|
| **Simple for Admin** | Just copy link and share - no configuration needed |
| **Self-Service** | Publishers join on their own, no manual registration |
| **Secure** | Links can be disabled or regenerated anytime |
| **Familiar UX** | Same pattern as Slack, Discord, Notion |
| **Scalable** | Works whether you have 2 or 200 publishers per workspace |

**Next Steps:**
1. Create database migration for workspaces and workspace_members tables
2. Modify linkedin-auth edge function to handle invite tokens
3. Create JoinWorkspace page for invite landing
4. Add workspace context and switcher to the app
5. Update existing hooks to filter by workspace

