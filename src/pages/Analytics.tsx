import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, Users, Heart, MessageCircle, Share2, TrendingUp, Loader2 } from 'lucide-react';
import { Header } from '@/components/Header';
import { useAuth } from '@/hooks/useAuth';
import { useAnalytics } from '@/hooks/useAnalytics';
import { StatCardWithTrend } from '@/components/StatCardWithTrend';
import { PerformanceChart } from '@/components/PerformanceChart';
import { TopPostsLeaderboard } from '@/components/TopPostsLeaderboard';
import { PublisherComparison } from '@/components/PublisherComparison';

const Analytics = () => {
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('30d');
  
  const { stats, trendData, topPosts, publisherRanking, isLoading } = useAnalytics(null, timeRange);

  // Redirect to auth if not logged in
  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  // Generate sparkline data from trend data
  const generateSparkline = (key: keyof typeof trendData[0]) => {
    return trendData.slice(-14).map(d => ({ value: d[key] as number }));
  };

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="p-8 max-w-7xl mx-auto">
        {/* Page Title */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">
            <span className="bg-gradient-to-r from-foreground via-foreground to-muted-foreground/60 bg-clip-text text-transparent">
              Analytics Dashboard
            </span>
          </h1>
          <p className="text-muted-foreground mt-2">
            Track performance across all your LinkedIn content
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          <StatCardWithTrend
            title="Total Posts"
            value={stats.totalPosts}
            icon={TrendingUp}
            colorClass="bg-primary/10 text-primary"
          />
          <StatCardWithTrend
            title="Total Reach"
            value={stats.totalReach}
            icon={Users}
            sparklineData={generateSparkline('reach')}
            colorClass="bg-info/10 text-info"
          />
          <StatCardWithTrend
            title="Impressions"
            value={stats.totalImpressions}
            icon={Eye}
            sparklineData={generateSparkline('impressions')}
            colorClass="bg-primary/10 text-primary"
          />
          <StatCardWithTrend
            title="Reactions"
            value={stats.totalReactions}
            icon={Heart}
            sparklineData={generateSparkline('reactions')}
            colorClass="bg-destructive/10 text-destructive"
          />
          <StatCardWithTrend
            title="Comments"
            value={stats.totalComments}
            icon={MessageCircle}
            sparklineData={generateSparkline('comments')}
            colorClass="bg-warning/10 text-warning"
          />
          <StatCardWithTrend
            title="Avg. Engagement"
            value={stats.avgEngagementRate}
            icon={TrendingUp}
            format="percentage"
            colorClass="bg-success/10 text-success"
          />
        </div>

        {/* Performance Chart */}
        <div className="mb-8">
          <PerformanceChart
            data={trendData}
            timeRange={timeRange}
            onTimeRangeChange={setTimeRange}
            isLoading={isLoading}
          />
        </div>

        {/* Bottom Grid - Top Posts and Publisher Comparison */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <TopPostsLeaderboard posts={topPosts} isLoading={isLoading} />
          <PublisherComparison publishers={publisherRanking} isLoading={isLoading} />
        </div>
      </main>
    </div>
  );
};

export default Analytics;
