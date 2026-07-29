import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useWorkspace } from './useWorkspace';
import { useAuth } from './useAuth';

export interface EngagementFolder {
  id: string;
  workspace_id: string;
  publisher_id: string;
  name: string;
  position: number;
  auto_like: boolean;
  auto_sync: boolean;
  created_at: string;
  updated_at: string;
}

export function useEngagementFolders(publisherId: string | null) {
  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: folders = [], isLoading } = useQuery({
    queryKey: ['engagement-folders', currentWorkspace?.id, publisherId],
    queryFn: async () => {
      if (!currentWorkspace || !publisherId) return [];
      const { data, error } = await (supabase as any)
        .from('engagement_folders')
        .select('*')
        .eq('workspace_id', currentWorkspace.id)
        .eq('publisher_id', publisherId)
        .order('position', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as EngagementFolder[];
    },
    enabled: !!currentWorkspace && !!publisherId,
  });

  const createFolder = useMutation({
    mutationFn: async (name: string) => {
      if (!currentWorkspace || !publisherId) throw new Error('No workspace or publisher');
      const trimmed = name.trim();
      if (!trimmed) throw new Error('Folder name required');
      const nextPosition = folders.length > 0
        ? Math.max(...folders.map((f) => f.position)) + 1
        : 0;
      const { data, error } = await (supabase as any)
        .from('engagement_folders')
        .insert({
          workspace_id: currentWorkspace.id,
          publisher_id: publisherId,
          name: trimmed,
          position: nextPosition,
          created_by: user?.id || null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as EngagementFolder;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['engagement-folders'] });
      toast.success('Folder created');
    },
    onError: (e: Error) => toast.error('Failed to create folder: ' + e.message),
  });

  const renameFolder = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error('Folder name required');
      const { error } = await (supabase as any)
        .from('engagement_folders')
        .update({ name: trimmed, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['engagement-folders'] });
    },
    onError: (e: Error) => toast.error('Rename failed: ' + e.message),
  });

  const deleteFolder = useMutation({
    mutationFn: async (id: string) => {
      // ON DELETE SET NULL on engagement_targets.folder_id moves targets to Unfiled
      const { error } = await (supabase as any)
        .from('engagement_folders')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['engagement-folders'] });
      queryClient.invalidateQueries({ queryKey: ['engagement-targets'] });
      toast.success('Folder removed');
    },
    onError: (e: Error) => toast.error('Delete failed: ' + e.message),
  });

  const moveTargetsToFolder = useMutation({
    mutationFn: async ({ targetIds, folderId }: { targetIds: string[]; folderId: string | null }) => {
      if (targetIds.length === 0) return 0;
      const updates: Record<string, unknown> = { folder_id: folderId };
      // Moving INTO a folder inherits that folder's automation settings.
      if (folderId) {
        const { data: f } = await (supabase as any)
          .from('engagement_folders')
          .select('auto_like, auto_sync')
          .eq('id', folderId)
          .maybeSingle();
        if (f) { updates.auto_like = f.auto_like; updates.auto_sync = f.auto_sync; }
      }
      const { error } = await (supabase as any)
        .from('engagement_targets')
        .update(updates)
        .in('id', targetIds);
      if (error) throw error;
      return targetIds.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['engagement-targets'] });
      queryClient.invalidateQueries({ queryKey: ['target-counts'] });
      toast.success(`Moved ${count} profile${count === 1 ? '' : 's'}`);
    },
    onError: (e: Error) => toast.error('Move failed: ' + e.message),
  });

  // Folder-level automation: set the folder's own auto_like/auto_sync AND
  // cascade it to every profile currently in the folder. Enabling auto_like
  // also kicks the auto-liker for those profiles right away.
  const setFolderAutomation = useMutation({
    mutationFn: async ({ folderId, updates }: { folderId: string; updates: Partial<{ auto_like: boolean; auto_sync: boolean }> }) => {
      if (!currentWorkspace) throw new Error('No workspace');
      const { error: fErr } = await (supabase as any)
        .from('engagement_folders')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', folderId);
      if (fErr) throw fErr;

      const { data: tRows, error: tErr } = await (supabase as any)
        .from('engagement_targets')
        .update(updates)
        .eq('folder_id', folderId)
        .eq('workspace_id', currentWorkspace.id)
        .select('id');
      if (tErr) throw tErr;
      const ids = ((tRows ?? []) as { id: string }[]).map((r) => r.id);

      let kicked = 0;
      if (updates.auto_like === true && ids.length > 0) {
        const results = await Promise.allSettled(ids.map((id) =>
          supabase.functions.invoke('auto-like-target-posts', {
            body: { workspace_id: currentWorkspace.id, target_id: id, trigger: 'folder_toggle' },
          }),
        ));
        kicked = results.filter((r) => r.status === 'fulfilled').length;
      }
      return { count: ids.length, kicked };
    },
    onSuccess: (res, { updates }) => {
      queryClient.invalidateQueries({ queryKey: ['engagement-folders'] });
      queryClient.invalidateQueries({ queryKey: ['engagement-targets'] });
      queryClient.invalidateQueries({ queryKey: ['discovered-posts'] });
      queryClient.invalidateQueries({ queryKey: ['target-counts'] });
      const label = 'auto_like' in updates
        ? (updates.auto_like ? 'Auto-like enabled' : 'Auto-like disabled')
        : (updates.auto_sync ? 'Auto-sync enabled' : 'Auto-sync paused');
      toast.success(`${label} for ${res.count} profile${res.count === 1 ? '' : 's'} in this folder`);
    },
    onError: (e: Error) => toast.error('Folder automation failed: ' + e.message),
  });

  return { folders, isLoading, createFolder, renameFolder, deleteFolder, moveTargetsToFolder, setFolderAutomation };
}
