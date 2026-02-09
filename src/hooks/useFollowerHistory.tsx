import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useMemo } from 'react';

export interface FollowerDataPoint {
  date: string;
  followerCount: number;
}

export interface FollowerStats {
  currentFollowers: number;
  netChange: number;
  avgDailyGain: number;
}

export function useFollowerHistory(publisherId: string | undefined, timeRange: '7d' | '30d' | '90d') {
  const daysMap = { '7d': 7, '30d': 30, '90d': 90 };
  const days = daysMap[timeRange];

  const { data: rawData = [], isLoading } = useQuery({
    queryKey: ['follower-history', publisherId, timeRange],
    queryFn: async () => {
      if (!publisherId) return [];

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      const cutoffStr = cutoffDate.toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('follower_history')
        .select('snapshot_date, follower_count')
        .eq('publisher_id', publisherId)
        .gte('snapshot_date', cutoffStr)
        .order('snapshot_date', { ascending: true });

      if (error) {
        console.error('Error fetching follower history:', error);
        return [];
      }

      return data || [];
    },
    enabled: !!publisherId,
  });

  const chartData: FollowerDataPoint[] = useMemo(() => {
    return rawData.map(row => ({
      date: row.snapshot_date,
      followerCount: row.follower_count,
    }));
  }, [rawData]);

  const stats: FollowerStats = useMemo(() => {
    if (chartData.length === 0) {
      return { currentFollowers: 0, netChange: 0, avgDailyGain: 0 };
    }

    const currentFollowers = chartData[chartData.length - 1].followerCount;
    const firstFollowers = chartData[0].followerCount;
    const netChange = currentFollowers - firstFollowers;
    const dayCount = chartData.length > 1 ? chartData.length - 1 : 1;
    const avgDailyGain = parseFloat((netChange / dayCount).toFixed(1));

    return { currentFollowers, netChange, avgDailyGain };
  }, [chartData]);

  return { chartData, stats, isLoading };
}
