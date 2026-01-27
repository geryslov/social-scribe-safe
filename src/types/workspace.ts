export interface Workspace {
  id: string;
  name: string;
  slug: string;
  inviteToken: string;
  inviteEnabled: boolean;
  companyName: string | null;
  logoUrl: string | null;
  description: string | null;
  theme: Record<string, unknown>;
  isTestWorkspace: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

export interface WorkspaceMember {
  id: string;
  workspaceId: string;
  userId: string;
  role: 'owner' | 'admin' | 'member';
  joinedVia: 'invite_link' | 'manual' | 'owner';
  createdAt: string;
}

export interface DbWorkspace {
  id: string;
  name: string;
  slug: string;
  invite_token: string;
  invite_enabled: boolean;
  company_name: string | null;
  logo_url: string | null;
  description: string | null;
  theme: Record<string, unknown>;
  is_test_workspace: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface DbWorkspaceMember {
  id: string;
  workspace_id: string;
  user_id: string;
  role: string;
  joined_via: string;
  created_at: string;
}

export const mapDbToWorkspace = (db: DbWorkspace): Workspace => ({
  id: db.id,
  name: db.name,
  slug: db.slug,
  inviteToken: db.invite_token,
  inviteEnabled: db.invite_enabled,
  companyName: db.company_name,
  logoUrl: db.logo_url,
  description: db.description,
  theme: db.theme || {},
  isTestWorkspace: db.is_test_workspace,
  createdAt: db.created_at,
  updatedAt: db.updated_at,
  createdBy: db.created_by,
});

export const mapDbToWorkspaceMember = (db: DbWorkspaceMember): WorkspaceMember => ({
  id: db.id,
  workspaceId: db.workspace_id,
  userId: db.user_id,
  role: db.role as WorkspaceMember['role'],
  joinedVia: db.joined_via as WorkspaceMember['joinedVia'],
  createdAt: db.created_at,
});
