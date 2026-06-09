import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useWorkspace } from './useWorkspace';
import { useAuth } from './useAuth';

export interface MonitoringTopic {
  id: string;
  workspace_id: string;
  publisher_id: string;
  topic_type: string;
  topic_value: string;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function useMonitoringTopics(publisherId: string | null) {
  const { currentWorkspace } = useWorkspace();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: topics = [], isLoading } = useQuery({
    queryKey: ['monitoring-topics', currentWorkspace?.id, publisherId],
    queryFn: async () => {
      if (!currentWorkspace || !publisherId) return [];

      const { data, error } = await (supabase as any)
        .from('monitoring_topics')
        .select('*')
        .eq('workspace_id', currentWorkspace.id)
        .eq('publisher_id', publisherId)
        .order('topic_type', { ascending: true });

      if (error) throw error;
      return data as MonitoringTopic[];
    },
    enabled: !!currentWorkspace && !!publisherId,
  });

  const createTopic = useMutation({
    mutationFn: async (data: { publisher_id: string; topic_type: string; topic_value: string }) => {
      if (!currentWorkspace) throw new Error('No workspace selected');

      const { data: result, error } = await (supabase as any)
        .from('monitoring_topics')
        .insert({
          workspace_id: currentWorkspace.id,
          publisher_id: data.publisher_id,
          topic_type: data.topic_type,
          topic_value: data.topic_value,
          created_by: user?.id || null,
        })
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monitoring-topics'] });
      toast.success('Topic added');
    },
    onError: (error) => {
      toast.error('Failed to add topic: ' + error.message);
    },
  });

  const updateTopic = useMutation({
    mutationFn: async (data: { id: string; topic_value?: string; is_active?: boolean }) => {
      const updates: Record<string, unknown> = {};
      if (data.topic_value !== undefined) updates.topic_value = data.topic_value;
      if (data.is_active !== undefined) updates.is_active = data.is_active;

      const { error } = await (supabase as any)
        .from('monitoring_topics')
        .update(updates)
        .eq('id', data.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monitoring-topics'] });
      toast.success('Topic updated');
    },
    onError: (error) => {
      toast.error('Failed to update topic: ' + error.message);
    },
  });

  const deleteTopic = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('monitoring_topics')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monitoring-topics'] });
      toast.success('Topic removed');
    },
    onError: (error) => {
      toast.error('Failed to remove topic: ' + error.message);
    },
  });

  return { topics, isLoading, createTopic, updateTopic, deleteTopic };
}
