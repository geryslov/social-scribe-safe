import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, Users, Heart, MessageCircle, TrendingUp, Loader2, RefreshCw, BarChart3 } from 'lucide-react';
import { Header } from '@/components/Header';
import { useAuth } from '@/hooks/useAuth';
import { useAnalytics } from '@/hooks/useAnalytics';
import { usePublishers } from '@/hooks/usePublishers';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useAutoSync } from '@/hooks/useAutoSync';
import { Button } from '@/components/ui/button';
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
      title: 'Avg Engagement',
      value: stats.avgEngagementRate,
      icon: TrendingUp,
      isPercentage: true,
      color: 'text-success',
      bgColor: 'bg-success/10',
    },
    {
      title: 'Total Posts',
      value: stats.totalPosts,
      icon: TrendingUp,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
    {
      title: 'Comments',
      value: stats.totalComments,
      icon: MessageCircle,
      sparkline: generateSparkline('comments'),
      color: 'text-warning',
      bgColor: 'bg-warning/10',
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main id="main-content" className="p-8 max-w-7xl mx-auto">

        {/* Page Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <p className="section-heading mb-2">Dashboard</p>
            <h1 className="text-4xl font-display font-extrabold tracking-tight">Analytics</h1>
            <p className="text-muted-foreground mt-2 text-sm">Performance across all publishers</p>
          </div>
          <div className="flex items-center gap-3">
            <DataPulse />
            {lastSyncTime && (
              <span className="text-xs text-muted-foreground bento-card px-3 py-1.5">
                Last sync: {format(new Date(lastSyncTime), 'HH:mm')}
              </span>
            )}
          </div>
        </div>

        {/* Top Stats Row — 4 primary + 2 secondary stacked */}
        <div className="grid grid-cols-6 gap-3 mb-6">
          {/* Primary stats — one column each */}
          {statCards.slice(0, 4).map((stat, i) => {
            const Icon = stat.icon;
            return (
              <div
                key={stat.title}
                className="bento-card p-5 group animate-fade-in"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="flex items-center gap-2 mb-4">
                  <div className={cn("p-2 rounded-xl group-hover:scale-110 transition-transform", stat.bgColor)}>
                    <Icon className={cn("h-4 w-4", stat.color)} />
                  </div>
                  <span className="text-xs text-muted-foreground font-medium">{stat.title}</span>
                </div>
                <p className="text-3xl font-display font-extrabold tabular-nums tracking-tight">
                  <CountUp
                    end={stat.value}
                    suffix={stat.isPercentage ? '%' : ''}
                    decimals={stat.isPercentage ? 1 : 0}
                  />
                </p>
              </div>
            );
          })}

          {/* Secondary stats — last 2 stacked in a 2-col span */}
          <div className="col-span-2 grid grid-rows-2 gap-3">
            {statCards.slice(4).map((stat, i) => {
              const Icon = stat.icon;
              return (
                <div
                  key={stat.title}
                  className="bento-card p-4 group animate-fade-in"
                  style={{ animationDelay: `${(i + 4) * 60}ms` }}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn("p-2 rounded-xl", stat.bgColor)}>
                      <Icon className={cn("h-4 w-4", stat.color)} />
                    </div>
                    <div>
                      <p className="text-xl font-display font-extrabold tabular-nums tracking-tight">
                        <CountUp
                          end={stat.value}
                          suffix={stat.isPercentage ? '%' : ''}
                          decimals={stat.isPercentage ? 1 : 0}
                        />
                      </p>
                      <p className="text-xs text-muted-foreground">{stat.title}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Performance Chart — full width bento */}
        <div className="bento-card p-1 mb-6">
          <PerformanceChart
            data={trendData}
            timeRange={timeRange}
            onTimeRangeChange={setTimeRange}
            isLoading={isLoading}
          />
        </div>

        {/* Bottom Grid — Top Posts (3/5) + Publisher Rankings (2/5) */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3">
            <TopPostsLeaderboard posts={topPosts} isLoading={isLoading} />
          </div>
          <div className="lg:col-span-2">
            {/* Publisher Rankings */}
            <div className="bento-card overflow-hidden">
              <div className="px-5 py-4 flex items-center justify-between border-b border-border">
                <p className="section-heading">Publisher Rankings</p>
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
              </div>
              <div className="p-3 space-y-1.5">
                {publisherRanking.slice(0, 6).map((pub, index) => (
                  <button
                    key={pub.name}
                    onClick={() => navigate(`/publisher/${encodeURIComponent(pub.name)}`)}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 rounded-xl transition-all duration-200",
                      "bg-muted border border-border",
                      "hover:bg-primary/5 hover:border-primary/20 hover:shadow-sm"
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
                      <p className="text-sm font-display font-bold text-success">
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
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Analytics;
