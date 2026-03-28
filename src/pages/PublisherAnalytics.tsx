import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Eye, Users, Heart, MessageCircle, Share2, TrendingUp, Loader2, ExternalLink, RefreshCw, ArrowLeft } from 'lucide-react';
import { Header } from '@/components/Header';
import { useAuth } from '@/hooks/useAuth';
import { useAnalytics } from '@/hooks/useAnalytics';
import { usePublishers } from '@/hooks/usePublishers';
import { usePosts } from '@/hooks/usePosts';
import { useWorkspace } from '@/hooks/useWorkspace';
import { PerformanceChart } from '@/components/PerformanceChart';
import { TopPostsLeaderboard } from '@/components/TopPostsLeaderboard';
import { PublisherAvatar } from '@/components/PublisherAvatar';
import { DataPulse } from '@/components/DataPulse';
import { CountUp } from '@/components/CountUp';
import { FollowerGrowthChart } from '@/components/FollowerGrowthChart';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';


const PublisherAnalytics = () => {
  const navigate = useNavigate();
  const { name } = useParams<{ name: string }>();
  const publisherName = decodeURIComponent(name || '');

  const { user, isLoading: authLoading } = useAuth();
  const { publishers: dbPublishers } = usePublishers();
  const { posts } = usePosts();

  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('30d');
  const [isSyncing, setIsSyncing] = useState(false);

  const { stats, trendData, topPosts, isLoading } = useAnalytics(publisherName, timeRange);

  const publisher = dbPublishers.find(p => p.name === publisherName);
  const publisherPosts = posts.filter(p => p.publisherName === publisherName && p.status === 'done');

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

  const handleSync = async () => {
    if (!publisher?.linkedin_connected || !publisher?.id) {
      toast.error('LinkedIn not connected for this publisher');
      return;
    }

    setIsSyncing(true);
    try {
      const { error } = await supabase.functions.invoke('fetch-linkedin-posts', {
        body: { publisherId: publisher.id },
      });

      if (error) throw error;
      toast.success('Analytics synced successfully');
    } catch (err) {
      console.error('Sync error:', err);
      toast.error('Failed to sync analytics');
    } finally {
      setIsSyncing(false);
    }
  };

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!publisher) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center h-[calc(100vh-73px)]">
          <div className="text-center">
            <h2 className="text-2xl font-display font-bold mb-2">Publisher Not Found</h2>
            <p className="text-muted-foreground mb-4">The publisher "{publisherName}" doesn't exist.</p>
            <Button onClick={() => navigate('/')}>Go to Dashboard</Button>
          </div>
        </div>
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
      title: 'Comments',
      value: stats.totalComments,
      icon: MessageCircle,
      sparkline: generateSparkline('comments'),
      color: 'text-warning',
      bgColor: 'bg-warning/10',
    },
    {
      title: 'Reshares',
      value: stats.totalReshares,
      icon: Share2,
      sparkline: generateSparkline('reshares'),
      color: 'text-success',
      bgColor: 'bg-success/10',
    },
    {
      title: 'Avg Engagement',
      value: stats.avgEngagementRate,
      icon: TrendingUp,
      isPercentage: true,
      color: 'text-cyan-400',
      bgColor: 'bg-cyan-400/10',
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main id="main-content" className="p-8 max-w-7xl mx-auto">

        {/* Back Button — Minimal */}
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back</span>
        </button>

        {/* Publisher Profile Hero — Warm bento card */}
        <div className="bento-card p-6 mb-8">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-5">
              <PublisherAvatar
                name={publisher.name}
                size="lg"
                className="w-20 h-20 ring-2 ring-primary/20"
              />
              <div>
                <h1 className="text-3xl font-display font-extrabold tracking-tight">{publisher.name}</h1>
                {publisher.role && (
                  <p className="text-muted-foreground mt-1 text-sm">{publisher.role}</p>
                )}
                <div className="flex items-center gap-3 mt-2">
                  <Badge
                    variant={publisher.linkedin_connected ? "default" : "secondary"}
                    className={cn(
                      "text-xs",
                      publisher.linkedin_connected && "bg-success/15 text-success border-success/20"
                    )}
                  >
                    {publisher.linkedin_connected ? 'Connected' : 'Not connected'}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {stats.totalPosts} published posts
                  </span>
                  {publisher.linkedin_url && (
                    <a
                      href={publisher.linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      <ExternalLink className="h-3 w-3" /> LinkedIn
                    </a>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <DataPulse />
              <Button
                onClick={handleSync}
                disabled={isSyncing || !publisher.linkedin_connected}
                variant="outline"
                size="sm"
                className="gap-1.5 rounded-xl h-8 text-xs border-border"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", isSyncing && "animate-spin")} />
                Sync
              </Button>
            </div>
          </div>
        </div>

        {/* Stat Cards — Bento with font-display */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
          {statCards.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <div
                key={stat.title}
                className="bento-card p-4 group animate-fade-in"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className={cn("p-1.5 rounded-lg group-hover:scale-110 transition-transform", stat.bgColor)}>
                    <Icon className={cn("h-3.5 w-3.5", stat.color)} />
                  </div>
                  <span className="text-xs text-muted-foreground">{stat.title}</span>
                </div>
                <p className="text-2xl font-display font-extrabold tabular-nums tracking-tight">
                  <CountUp
                    end={stat.value}
                    suffix={stat.isPercentage ? '%' : ''}
                    decimals={stat.isPercentage ? 1 : 0}
                  />
                </p>
              </div>
            );
          })}
        </div>

        {/* Follower Growth */}
        <div className="mb-8">
          <p className="section-heading mb-4">Follower Growth</p>
          <FollowerGrowthChart
            publisherId={publisher.id}
            timeRange={timeRange}
            onTimeRangeChange={setTimeRange}
          />
        </div>

        {/* Performance Chart */}
        <div className="mb-8">
          <p className="section-heading mb-4">Performance</p>
          <PerformanceChart
            data={trendData}
            timeRange={timeRange}
            onTimeRangeChange={setTimeRange}
            isLoading={isLoading}
          />
        </div>

        {/* Top Posts & Recent Activity — 3:2 split */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3">
            <p className="section-heading mb-4">Top Posts</p>
            <TopPostsLeaderboard posts={topPosts} isLoading={isLoading} />
          </div>

          {/* Recent Activity — Bento card */}
          <div className="lg:col-span-2">
            <div className="bento-card overflow-hidden">
              <div className="px-5 py-3 border-b border-border">
                <p className="section-heading">Recent Activity</p>
              </div>
              <div className="p-3 space-y-1.5">
                {topPosts.slice(0, 5).map((post, index) => (
                  <div
                    key={post.id}
                    className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted transition-colors"
                  >
                    <span className="w-6 h-6 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-xs font-display font-bold">
                      {index + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{post.content.substring(0, 60)}...</p>
                    </div>
                    <p className="text-sm font-display font-bold tabular-nums">{(post.impressions || 0).toLocaleString()}</p>
                  </div>
                ))}
                {topPosts.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>No published posts yet</p>
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

export default PublisherAnalytics;
