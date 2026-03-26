import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, Users, Heart, MessageCircle, Share2, TrendingUp, Loader2, RefreshCw } from 'lucide-react';
import { Header } from '@/components/Header';
import { useAuth } from '@/hooks/useAuth';
import { useAnalytics } from '@/hooks/useAnalytics';
import { usePublishers } from '@/hooks/usePublishers';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useAutoSync } from '@/hooks/useAutoSync';
import { Button } from '@/components/ui/button';
import { CyberCard, CyberCardContent, CyberCardHeader, CyberCardTitle } from '@/components/ui/cyber-card';
import { PerformanceChart } from '@/components/PerformanceChart';
import { TopPostsLeaderboard } from '@/components/TopPostsLeaderboard';
import { DataPulse } from '@/components/DataPulse';
import { CountUp } from '@/components/CountUp';
import { PublisherAvatar } from '@/components/PublisherAvatar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';



const Analytics = () => {
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();
  const { publishers: dbPublishers, refreshAllAvatars } = usePublishers();

  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('30d');

  // Auto-sync LinkedIn analytics on login
  const { isSyncing: isAutoSyncing, lastSyncTime } = useAutoSync(dbPublishers, user?.id);

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
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        {isAutoSyncing && (
          <p className="text-sm text-muted-foreground">Syncing analytics...</p>
        )}
      </div>
    );
  }

  const statCards = [
    {
      title: 'Total Posts',
      value: stats.totalPosts,
      icon: TrendingUp,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
    {
      title: 'Total Reach',
      value: stats.totalReach,
      icon: Users,
      sparkline: generateSparkline('reach'),
      color: 'text-info',
      bgColor: 'bg-info/10',
    },
    {
      title: 'Impressions',
      value: stats.totalImpressions,
      icon: Eye,
      sparkline: generateSparkline('impressions'),
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
    {
      title: 'Reactions',
      value: stats.totalReactions,
      icon: Heart,
      sparkline: generateSparkline('reactions'),
      color: 'text-destructive',
      bgColor: 'bg-destructive/10',
    },
    {
      title: 'Comments',
      value: stats.totalComments,
      icon: MessageCircle,
      sparkline: generateSparkline('comments'),
      color: 'text-warning',
      bgColor: 'bg-warning/10',
    },
    {
      title: 'Avg Engagement',
      value: stats.avgEngagementRate,
      icon: TrendingUp,
      isPercentage: true,
      color: 'text-success',
      bgColor: 'bg-success/10',
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main id="main-content" className="p-8 max-w-7xl mx-auto">
        {/* Background glow */}
        <div className="fixed inset-0 pointer-events-none -z-10" aria-hidden="true">
          <div className="absolute top-0 left-1/4 w-96 h-96 rounded-full opacity-[0.04]"
            style={{ background: 'radial-gradient(circle, hsl(var(--primary)) 0%, transparent 70%)' }}
          />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full opacity-[0.03]"
            style={{ background: 'radial-gradient(circle, hsl(var(--accent)) 0%, transparent 70%)' }}
          />
        </div>

        {/* Page Title */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">
              <span className="gradient-text">Analytics</span>
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Performance overview across all publishers
            </p>
          </div>
          <div className="flex items-center gap-4">
            <DataPulse />
            {lastSyncTime && (
              <span className="text-xs text-muted-foreground">
                Last sync: {format(new Date(lastSyncTime), 'HH:mm')}
              </span>
            )}
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          {statCards.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <CyberCard
                key={stat.title}
                variant="elevated"
                className="animate-fade-in group"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <CyberCardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className={cn("p-2 rounded-lg transition-colors group-hover:scale-110 duration-200", stat.bgColor)}>
                      <Icon className={cn("h-4 w-4", stat.color)} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-2xl font-bold tabular-nums data-value">
                      <CountUp
                        end={stat.value}
                        suffix={stat.isPercentage ? '%' : ''}
                        decimals={stat.isPercentage ? 1 : 0}
                      />
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {stat.title}
                    </p>
                  </div>
                </CyberCardContent>
              </CyberCard>
            );
          })}
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

          {/* Publisher Rankings - Clickable */}
          <CyberCard>
            <CyberCardHeader className="flex-row items-center justify-between">
              <CyberCardTitle className="flex items-center gap-2">
                <Users className="h-4 w-4 text-info" />
                PUBLISHER RANKINGS
              </CyberCardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => refreshAllAvatars.mutate()}
                disabled={refreshAllAvatars.isPending}
                className="text-xs gap-1"
              >
                <RefreshCw className={cn("h-3 w-3", refreshAllAvatars.isPending && "animate-spin")} />
                {refreshAllAvatars.isPending ? 'Refreshing...' : 'Refresh Photos'}
              </Button>
            </CyberCardHeader>
            <CyberCardContent>
              <div className="space-y-2">
                {publisherRanking.slice(0, 6).map((pub, index) => (
                  <button
                    key={pub.name}
                    onClick={() => navigate(`/publisher/${encodeURIComponent(pub.name)}`)}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 rounded-lg transition-all duration-200",
                      "bg-muted/30 border border-border/30",
                      "hover:bg-primary/10 hover:border-primary/30 hover:shadow-[0_0_20px_hsl(var(--primary)/0.1)]"
                    )}
                  >
                    <span className={cn(
                      "w-6 h-6 rounded flex items-center justify-center text-xs font-mono font-bold",
                      index === 0 && "bg-warning/20 text-warning",
                      index === 1 && "bg-muted-foreground/20 text-muted-foreground",
                      index === 2 && "bg-warning/30 text-warning/80",
                      index > 2 && "bg-primary/20 text-primary"
                    )}>
                      {index + 1}
                    </span>
                    <PublisherAvatar name={pub.name} size="sm" className="w-8 h-8" />
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-sm font-medium truncate">{pub.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">
                      {pub.postCount} posts • {pub.totalReach.toLocaleString()} reach
                        {(() => {
                          const dbPub = dbPublishers.find(p => p.name === pub.name);
                          return dbPub?.followers_count ? ` • ${dbPub.followers_count.toLocaleString()} followers` : '';
                        })()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-mono font-bold text-success">
                        {pub.avgEngagementRate.toFixed(1)}%
                      </p>
                      <p className="text-xs text-muted-foreground">Engagement</p>
                    </div>
                  </button>
                ))}
                {publisherRanking.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>No publisher data</p>
                    <p className="text-xs mt-1">Publish posts to see rankings</p>
                  </div>
                )}
              </div>
            </CyberCardContent>
          </CyberCard>
        </div>
      </main>
    </div>
  );
};

export default Analytics;
