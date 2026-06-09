import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useWorkspace } from './useWorkspace';

export interface IntelligenceItem {
  id: string;
  workspace_id: string;
  publisher_id: string;
  research_run_id: string | null;
  topic_id: string | null;
  source_type: string;
  title: string;
  url: string;
  content_snippet: string | null;
  author: string | null;
  published_at: string | null;
  engagement_score: number;
  upvotes: number;
  comments_count: number;
  views: number;
  points: number;
  source_metadata: Record<string, unknown>;
  is_used_in_document: boolean;
  used_in_document_id: string | null;
  created_at: string;
}

export function useIntelligenceItems(publisherId: string | null) {
  const { currentWorkspace } = useWorkspace();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['intelligence-items', currentWorkspace?.id, publisherId],
    queryFn: async () => {
      if (!currentWorkspace || !publisherId) return [];

      const { data, error } = await (supabase as any)
        .from('intelligence_items')
        .select('*')
        .eq('workspace_id', currentWorkspace.id)
        .eq('publisher_id', publisherId)
        .order('engagement_score', { ascending: false });

      if (error) throw error;
      return data as IntelligenceItem[];
    },
    enabled: !!currentWorkspace && !!publisherId,
  });

  return { items, isLoading };
}

export function useMarkItemUsed() {
  const queryClient = useQueryClient();

  const markUsed = useMutation({
    mutationFn: async ({ itemIds, documentId }: { itemIds: string[]; documentId: string }) => {
      const { error } = await (supabase as any)
        .from('intelligence_items')
        .update({ is_used_in_document: true, used_in_document_id: documentId })
        .in('id', itemIds);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['intelligence-items'] });
    },
    onError: (error) => {
      toast.error('Failed to mark items as used: ' + error.message);
    },
  });

  return markUsed;
}

export function useRunResearch() {
  const queryClient = useQueryClient();

  const runResearch = useMutation({
    mutationFn: async ({ workspace_id, publisher_id }: { workspace_id: string; publisher_id: string }) => {
      const { data, error } = await supabase.functions.invoke('run-research', {
        body: { workspace_id, publisher_id, trigger_type: 'manual' },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Research run failed');
      return data as { success: boolean; run_id: string; items_found: number; sources_used: string[]; message?: string };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['intelligence-items'] });
      queryClient.invalidateQueries({ queryKey: ['research-runs'] });
      if (data.items_found > 0) {
        toast.success(`Found ${data.items_found} items from ${data.sources_used.join(', ')}`);
      } else {
        toast.info(data.message || 'No new items found');
      }
    },
    onError: (error) => {
      toast.error('Research failed: ' + error.message);
    },
  });

  return runResearch;
}
