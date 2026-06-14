import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useWorkspace } from './useWorkspace';

export interface EngagementSyncRun {
  id: string;
  workspace_id: string | null;
  started_at: string;
  finished_at: string | null;
  total_targets: number;
  synced: number;
  skipped: number;
  failed: number;
  new_posts: number;
  trigger: string;
}

export interface EngagementSettings {
  workspace_id: string;
  auto_sync_enabled: boolean;
  updated_at: string;
}

// Cron runs daily at 06:00 UTC
export function getNextScheduledSync(now: Date = new Date()): Date {
  const next = new Date(now);
  next.setUTCHours(6, 0, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next;
}

export function useEngagementSync() {
  const { currentWorkspace } = useWorkspace();
  const queryClient = useQueryClient();

  const settingsQuery = useQuery({
    queryKey: ['engagement-settings', currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace) return null;
      const { data, error } = await (supabase as any)
        .from('workspace_engagement_settings')
        .select('*')
        .eq('workspace_id', currentWorkspace.id)
        .maybeSingle();
      if (error) throw error;
      return (data as EngagementSettings | null) ?? {
        workspace_id: currentWorkspace.id,
        auto_sync_enabled: true,
        updated_at: new Date().toISOString(),
      };
    },
    enabled: !!currentWorkspace,
  });

  const lastRunQuery = useQuery({
    queryKey: ['engagement-sync-runs', currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace) return null;
      const { data, error } = await (supabase as any)
        .from('engagement_sync_runs')
        .select('*')
        .eq('workspace_id', currentWorkspace.id)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as EngagementSyncRun | null;
    },
    enabled: !!currentWorkspace,
    refetchInterval: 30_000,
  });

  const toggle = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!currentWorkspace) throw new Error('No workspace');
      const { error } = await (supabase as any)
        .from('workspace_engagement_settings')
        .upsert(
          {
            workspace_id: currentWorkspace.id,
            auto_sync_enabled: enabled,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'workspace_id' },
        );
      if (error) throw error;
      return enabled;
    },
    onSuccess: (enabled) => {
      queryClient.invalidateQueries({ queryKey: ['engagement-settings'] });
      toast.success(enabled ? 'Auto sync enabled' : 'Auto sync disabled');
    },
    onError: (e: Error) => toast.error('Failed: ' + e.message),
  });

  const runNow = useMutation({
    mutationFn: async () => {
      if (!currentWorkspace) throw new Error('No workspace');
      const { data, error } = await supabase.functions.invoke('sync-all-engagement-targets', {
        body: { workspace_id: currentWorkspace.id, trigger: 'manual' },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['engagement-sync-runs'] });
      queryClient.invalidateQueries({ queryKey: ['engagement-posts'] });
      queryClient.invalidateQueries({ queryKey: ['engagement-targets'] });
      const s = data?.workspaces?.[0]?.summary;
      if (s) {
        toast.success(`Sync done — ${s.new_posts} new post${s.new_posts === 1 ? '' : 's'} from ${s.synced} profile${s.synced === 1 ? '' : 's'}`);
      } else {
        toast.success('Sync started');
      }
    },
    onError: (e: Error) => toast.error('Sync failed: ' + e.message),
  });

  return {
    settings: settingsQuery.data,
    lastRun: lastRunQuery.data,
    isLoading: settingsQuery.isLoading || lastRunQuery.isLoading,
    toggle,
    runNow,
  };
}
