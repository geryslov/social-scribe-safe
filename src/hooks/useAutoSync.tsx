import { useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Publisher } from './usePublishers';

const SYNC_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes cooldown between syncs
const LAST_SYNC_KEY = 'lastAutoSyncTimestamp';

export function useAutoSync(publishers: Publisher[], userId: string | undefined) {
  const queryClient = useQueryClient();
  const hasSyncedRef = useRef(false);

  const syncAllMutation = useMutation({
    mutationFn: async (connectedPublishers: Publisher[]) => {
      const results: { publisherId: string; success: boolean; syncedCount: number }[] = [];
      
      for (const publisher of connectedPublishers) {
        try {
          const { data, error } = await supabase.functions.invoke('fetch-linkedin-posts', {
            body: { publisherId: publisher.id }
          });
          
          if (error) throw error;
          if (data.error) throw new Error(data.error);
          
          results.push({
            publisherId: publisher.id,
            success: true,
            syncedCount: data.syncedCount || 0,
          });
        } catch (err) {
          console.error(`Failed to sync publisher ${publisher.name}:`, err);
          results.push({
            publisherId: publisher.id,
            success: false,
            syncedCount: 0,
          });
        }
      }
      
      return results;
    },
    onSuccess: (results) => {
      const totalSynced = results.reduce((sum, r) => sum + r.syncedCount, 0);
      const successCount = results.filter(r => r.success).length;
      
      if (totalSynced > 0 || successCount > 0) {
        queryClient.invalidateQueries({ queryKey: ['app-published-posts'] });
        queryClient.invalidateQueries({ queryKey: ['analytics-posts'] });
        queryClient.invalidateQueries({ queryKey: ['posts'] });
        
        toast.success(`Analytics synced for ${successCount} publisher${successCount !== 1 ? 's' : ''}`);
      }
      
      // Store last sync timestamp
      localStorage.setItem(LAST_SYNC_KEY, Date.now().toString());
    },
    onError: (error) => {
      console.error('Auto-sync failed:', error);
    },
  });

  // Auto-sync on login
  useEffect(() => {
    if (!userId || hasSyncedRef.current) return;
    
    // Check cooldown
    const lastSync = localStorage.getItem(LAST_SYNC_KEY);
    if (lastSync) {
      const timeSinceLastSync = Date.now() - parseInt(lastSync, 10);
      if (timeSinceLastSync < SYNC_COOLDOWN_MS) {
        hasSyncedRef.current = true;
        return;
      }
    }
    
    // Find publishers with LinkedIn connected
    const connectedPublishers = publishers.filter(p => p.linkedin_connected);
    
    if (connectedPublishers.length === 0) {
      hasSyncedRef.current = true;
      return;
    }
    
    // Trigger sync
    hasSyncedRef.current = true;
    syncAllMutation.mutate(connectedPublishers);
  }, [userId, publishers, syncAllMutation]);

  const lastSyncTime = localStorage.getItem(LAST_SYNC_KEY);

  return {
    isSyncing: syncAllMutation.isPending,
    syncAll: (connectedPublishers: Publisher[]) => syncAllMutation.mutate(connectedPublishers),
    lastSyncTime: lastSyncTime ? parseInt(lastSyncTime, 10) : null,
  };
}
