import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useWorkspace } from './useWorkspace';

export type WorkspaceRole = 'owner' | 'admin' | 'creator' | 'member' | null;

export interface WorkspacePermissions {
  role: WorkspaceRole;
  isLoading: boolean;
  can: {
    generateAi: boolean;
    assign: boolean;
    publishLinkedIn: boolean;
    manageWorkspace: boolean;
    invite: boolean;
  };
}

/**
 * Returns the caller's role and granular permissions for the active workspace.
 * Global platform admins get every permission.
 */
export function useWorkspacePermissions(): WorkspacePermissions {
  const { user, isAdmin } = useAuth();
  const { currentWorkspace } = useWorkspace();

  const { data: role = null, isLoading } = useQuery<WorkspaceRole>({
    queryKey: ['workspace-role', currentWorkspace?.id, user?.id],
    enabled: !!user && !!currentWorkspace,
    queryFn: async () => {
      if (isAdmin) return 'admin';
      const { data } = await supabase
        .from('workspace_members')
        .select('role')
        .eq('user_id', user!.id)
        .eq('workspace_id', currentWorkspace!.id)
        .maybeSingle();
      return (data?.role as WorkspaceRole) ?? null;
    },
  });

  return useMemo(() => {
    const effective: WorkspaceRole = isAdmin ? 'admin' : role;
    const isManager = effective === 'owner' || effective === 'admin';
    const isCreator = isManager || effective === 'creator';
    return {
      role: effective,
      isLoading,
      can: {
        generateAi: isCreator,
        assign: isCreator,
        publishLinkedIn: isCreator,
        manageWorkspace: isManager,
        invite: isManager,
      },
    };
  }, [role, isAdmin, isLoading]);
}
