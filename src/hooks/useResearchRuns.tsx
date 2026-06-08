import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from './useWorkspace';

export interface ResearchRun {
  id: string;
  workspace_id: string;
  publisher_id: string;
  status: string;
  trigger_type: string;
  sources_used: string[];
  topics_searched: string[];
  items_found: number;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  created_at: string;
}

export function useResearchRuns(publisherId: string | null) {
  const { currentWorkspace } = useWorkspace();

  const { data: runs = [], isLoading } = useQuery({
    queryKey: ['research-runs', currentWorkspace?.id, publisherId],
    queryFn: async () => {
      if (!currentWorkspace || !publisherId) return [];

      const { data, error } = await supabase
        .from('research_runs')
        .select('*')
        .eq('workspace_id', currentWorkspace.id)
        .eq('publisher_id', publisherId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      return data as ResearchRun[];
    },
    enabled: !!currentWorkspace && !!publisherId,
  });

  return { runs, isLoading };
}
