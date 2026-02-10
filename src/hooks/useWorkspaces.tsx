import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from './useAuth';
import { 
  Workspace, 
  WorkspaceMember, 
  DbWorkspace, 
  DbWorkspaceMember,
  mapDbToWorkspace, 
  mapDbToWorkspaceMember 
} from '@/types/workspace';

export function useWorkspaces() {
  const queryClient = useQueryClient();
  const { user, isAdmin } = useAuth();

  // Fetch all workspaces (admin only)
  const { data: workspaces = [], isLoading } = useQuery({
    queryKey: ['all-workspaces'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workspaces')
        .select('*')
        .order('name');
      
      if (error) throw error;
      return (data as DbWorkspace[]).map(mapDbToWorkspace);
    },
    enabled: isAdmin,
  });

  // Fetch publisher counts per workspace
  const { data: publisherCounts = {} } = useQuery({
    queryKey: ['workspace-publisher-counts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('publishers')
        .select('workspace_id');
      
      if (error) throw error;
      
      // Count publishers per workspace
      const counts: Record<string, number> = {};
      data.forEach((p) => {
        if (p.workspace_id) {
          counts[p.workspace_id] = (counts[p.workspace_id] || 0) + 1;
        }
      });
      return counts;
    },
    enabled: isAdmin,
  });

  const createWorkspace = useMutation({
    mutationFn: async (data: { 
      name: string; 
      slug: string;
      companyName?: string;
      description?: string;
    }) => {
      if (!user) throw new Error('Not authenticated');
      
      const { data: result, error } = await supabase
        .from('workspaces')
        .insert({
          name: data.name,
          slug: data.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
          company_name: data.companyName || null,
          description: data.description || null,
          created_by: user.id,
        })
        .select()
        .single();
      
      if (error) throw error;
      
      // Add creator as owner
      await supabase.from('workspace_members').insert({
        workspace_id: result.id,
        user_id: user.id,
        role: 'owner',
        joined_via: 'owner',
      });
      
      return mapDbToWorkspace(result as DbWorkspace);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      toast.success('Workspace created');
    },
    onError: (error) => {
      toast.error('Failed to create workspace: ' + error.message);
    },
  });

  const updateWorkspace = useMutation({
    mutationFn: async (data: { 
      id: string;
      name?: string; 
      companyName?: string;
      description?: string;
      inviteEnabled?: boolean;
      logoUrl?: string;
      theme?: Record<string, unknown>;
      systemPrompt?: string | null;
    }) => {
      const updates: Record<string, unknown> = {};
      if (data.name !== undefined) updates.name = data.name;
      if (data.companyName !== undefined) updates.company_name = data.companyName;
      if (data.description !== undefined) updates.description = data.description;
      if (data.inviteEnabled !== undefined) updates.invite_enabled = data.inviteEnabled;
      if (data.logoUrl !== undefined) updates.logo_url = data.logoUrl;
      if (data.theme !== undefined) updates.theme = data.theme;
      if (data.systemPrompt !== undefined) updates.system_prompt = data.systemPrompt;
      
      const { error } = await supabase
        .from('workspaces')
        .update(updates)
        .eq('id', data.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-workspaces'] });
      // Use partial match to invalidate all workspace queries regardless of user ID
      queryClient.invalidateQueries({ queryKey: ['workspaces'], exact: false });
      toast.success('Workspace updated');
    },
    onError: (error) => {
      toast.error('Failed to update workspace: ' + error.message);
    },
  });

  const regenerateInviteToken = useMutation({
    mutationFn: async (workspaceId: string) => {
      // Generate new token by calling a function or direct update
      const newToken = crypto.randomUUID().replace(/-/g, '').substring(0, 32);
      
      const { error } = await supabase
        .from('workspaces')
        .update({ invite_token: newToken })
        .eq('id', workspaceId);
      
      if (error) throw error;
      return newToken;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      toast.success('Invite link regenerated');
    },
    onError: (error) => {
      toast.error('Failed to regenerate invite link: ' + error.message);
    },
  });

  const deleteWorkspace = useMutation({
    mutationFn: async (workspaceId: string) => {
      const { error } = await supabase
        .from('workspaces')
        .delete()
        .eq('id', workspaceId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      toast.success('Workspace deleted');
    },
    onError: (error) => {
      toast.error('Failed to delete workspace: ' + error.message);
    },
  });

  return {
    workspaces,
    publisherCounts,
    isLoading,
    isAdmin,
    createWorkspace,
    updateWorkspace,
    regenerateInviteToken,
    deleteWorkspace,
  };
}

export function useWorkspaceMembers(workspaceId: string) {
  const queryClient = useQueryClient();

  const { data: members = [], isLoading } = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workspace_members')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at');
      
      if (error) throw error;
      return (data as DbWorkspaceMember[]).map(mapDbToWorkspaceMember);
    },
    enabled: !!workspaceId,
  });

  const updateMemberRole = useMutation({
    mutationFn: async ({ memberId, role }: { memberId: string; role: string }) => {
      const { error } = await supabase
        .from('workspace_members')
        .update({ role })
        .eq('id', memberId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-members', workspaceId] });
      toast.success('Member role updated');
    },
    onError: (error) => {
      toast.error('Failed to update role: ' + error.message);
    },
  });

  const removeMember = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase
        .from('workspace_members')
        .delete()
        .eq('id', memberId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-members', workspaceId] });
      toast.success('Member removed');
    },
    onError: (error) => {
      toast.error('Failed to remove member: ' + error.message);
    },
  });

  return {
    members,
    isLoading,
    updateMemberRole,
    removeMember,
  };
}

// Hook to fetch workspace by invite token (for join page)
export function useWorkspaceByToken(token: string) {
  return useQuery({
    queryKey: ['workspace-by-token', token],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workspaces')
        .select('id, name, slug, company_name, logo_url, description, invite_enabled')
        .eq('invite_token', token)
        .eq('invite_enabled', true)
        .maybeSingle();
      
      if (error) throw error;
      if (!data) return null;
      
      return {
        id: data.id,
        name: data.name,
        slug: data.slug,
        companyName: data.company_name,
        logoUrl: data.logo_url,
        description: data.description,
      };
    },
    enabled: !!token,
  });
}
