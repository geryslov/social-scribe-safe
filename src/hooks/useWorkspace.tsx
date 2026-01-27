import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { Workspace, DbWorkspace, mapDbToWorkspace } from '@/types/workspace';

interface WorkspaceContextType {
  currentWorkspace: Workspace | null;
  workspaces: Workspace[];
  isLoading: boolean;
  setCurrentWorkspace: (workspace: Workspace | null) => void;
  switchWorkspace: (workspaceId: string) => void;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null);

  // Fetch workspaces the user has access to
  const { data: workspaces = [], isLoading } = useQuery({
    queryKey: ['workspaces', user?.id],
    queryFn: async () => {
      if (!user) return [];
      
      // First get workspace IDs from workspace_members
      const { data: memberData, error: memberError } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', user.id);
      
      if (memberError) {
        console.error('Error fetching workspace memberships:', memberError);
        return [];
      }
      
      const workspaceIds = memberData?.map(m => m.workspace_id) || [];
      
      if (workspaceIds.length === 0) {
        // Check if user is admin - admins can see all workspaces
        const { data: allWorkspaces, error: allError } = await supabase
          .from('workspaces')
          .select('*')
          .order('name');
        
        if (allError) {
          console.error('Error fetching all workspaces:', allError);
          return [];
        }
        
        return (allWorkspaces as DbWorkspace[]).map(mapDbToWorkspace);
      }
      
      // Fetch workspaces
      const { data, error } = await supabase
        .from('workspaces')
        .select('*')
        .in('id', workspaceIds)
        .order('name');
      
      if (error) {
        console.error('Error fetching workspaces:', error);
        return [];
      }
      
      return (data as DbWorkspace[]).map(mapDbToWorkspace);
    },
    enabled: !!user,
  });

  // Set initial workspace when workspaces load
  useEffect(() => {
    if (workspaces.length > 0 && !currentWorkspace) {
      // Try to restore from localStorage
      const savedWorkspaceId = localStorage.getItem('currentWorkspaceId');
      const savedWorkspace = workspaces.find(w => w.id === savedWorkspaceId);
      setCurrentWorkspace(savedWorkspace || workspaces[0]);
    }
  }, [workspaces, currentWorkspace]);

  // Save current workspace to localStorage
  useEffect(() => {
    if (currentWorkspace) {
      localStorage.setItem('currentWorkspaceId', currentWorkspace.id);
    }
  }, [currentWorkspace]);

  const switchWorkspace = (workspaceId: string) => {
    const workspace = workspaces.find(w => w.id === workspaceId);
    if (workspace) {
      setCurrentWorkspace(workspace);
    }
  };

  return (
    <WorkspaceContext.Provider
      value={{
        currentWorkspace,
        workspaces,
        isLoading,
        setCurrentWorkspace,
        switchWorkspace,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (context === undefined) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
}
