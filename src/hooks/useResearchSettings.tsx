import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useWorkspace } from './useWorkspace';

export interface ResearchSettings {
  id: string;
  workspace_id: string;
  schedule_frequency: string;
  schedule_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export function useResearchSettings() {
  const { currentWorkspace } = useWorkspace();
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ['research-settings', currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace) return null;

      const { data, error } = await supabase
        .from('workspace_research_settings')
        .select('*')
        .eq('workspace_id', currentWorkspace.id)
        .maybeSingle();

      if (error) throw error;
      return data as ResearchSettings | null;
    },
    enabled: !!currentWorkspace,
  });

  const upsertSettings = useMutation({
    mutationFn: async (data: { schedule_frequency: string; schedule_enabled: boolean }) => {
      if (!currentWorkspace) throw new Error('No workspace selected');

      const { error } = await supabase
        .from('workspace_research_settings')
        .upsert(
          {
            workspace_id: currentWorkspace.id,
            schedule_frequency: data.schedule_frequency,
            schedule_enabled: data.schedule_enabled,
          },
          { onConflict: 'workspace_id' },
        );

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['research-settings'] });
      toast.success('Research settings saved');
    },
    onError: (error) => {
      toast.error('Failed to save settings: ' + error.message);
    },
  });

  return { settings, isLoading, upsertSettings };
}
