import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Eye, Users, Heart, MessageCircle, Share2, TrendingUp, Loader2, ExternalLink, RefreshCw, ArrowLeft } from 'lucide-react';
import { Header } from '@/components/Header';
import { useAuth } from '@/hooks/useAuth';
import { useAnalytics } from '@/hooks/useAnalytics';
import { usePublishers } from '@/hooks/usePublishers';
import { usePosts } from '@/hooks/usePosts';
import { useWorkspace } from '@/hooks/useWorkspace';
import { CyberCard, CyberCardContent, CyberCardHeader, CyberCardTitle } from '@/components/ui/cyber-card';
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
            <h2 className="text-2xl font-bold mb-2">Publisher Not Found</h2>
            <p className="text-muted-foreground mb-4">The publisher "{publisherName}" doesn't exist.</p>
            <Button onClick={() => navigate('/')}>Go to Dashboard</Button>
          </div>
        </div>
      </div>
    );
  }

  const statCards = [
    {
      title: 'TOTAL REACH',
      value: stats.totalReach,
      icon: Users,
      sparkline: generateSparkline('reach'),
      color: 'text-info',
      bgColor: 'bg-info/10',
    },
    {
      title: 'IMPRESSIONS',
      value: stats.totalImpressions,
      icon: Eye,
      sparkline: generateSparkline('impressions'),
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
    {
      title: 'REACTIONS',
      value: stats.totalReactions,
      icon: Heart,
      sparkline: generateSparkline('reactions'),
      color: 'text-destructive',
      bgColor: 'bg-destructive/10',
    },
    {
      title: 'COMMENTS',
      value: stats.totalComments,
      icon: MessageCircle,
      sparkline: generateSparkline('comments'),
      color: 'text-warning',
      bgColor: 'bg-warning/10',
    },
    {
      title: 'RESHARES',
      value: stats.totalReshares,
      icon: Share2,
      sparkline: generateSparkline('reshares'),
      color: 'text-success',
      bgColor: 'bg-success/10',
    },
    {
      title: 'AVG ENGAGEMENT',
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
      
      <main className="p-8 max-w-7xl mx-auto">
        {/* Back Button */}
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => navigate('/')}
          className="mb-6 gap-2 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Button>

        {/* Publisher Header */}
        <div className="mb-8">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-5">
              <PublisherAvatar 
                name={publisher.name} 
                size="lg" 
                className="w-20 h-20 ring-2 ring-primary/30 shadow-[0_0_30px_rgba(139,92,246,0.2)]"
              />
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-3xl font-bold font-mono tracking-tight">{publisher.name}</h1>
                  {publisher.linkedin_url && (
                    <a
                      href={publisher.linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:text-primary/80 transition-colors"
                    >
                      <ExternalLink className="h-5 w-5" />
                    </a>
                  )}
                </div>
                {publisher.role && (
                  <p className="text-muted-foreground mt-1 font-mono text-sm">{publisher.role}</p>
                )}
                <div className="flex items-center gap-3 mt-2">
                  <Badge 
                    variant={publisher.linkedin_connected ? "default" : "secondary"}
                    className={cn(
                      "font-mono text-xs",
                      publisher.linkedin_connected && "bg-success/20 text-success border-success/30"
                    )}
                  >
                    {publisher.linkedin_connected ? '● CONNECTED' : '○ NOT CONNECTED'}
                  </Badge>
                  <span className="text-xs text-muted-foreground font-mono">
                    {stats.totalPosts} PUBLISHED POSTS
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <DataPulse />
              <Button
                onClick={handleSync}
                disabled={isSyncing || !publisher.linkedin_connected}
                variant="outline"
                size="sm"
                className="gap-2 font-mono"
              >
                <RefreshCw className={cn("h-4 w-4", isSyncing && "animate-spin")} />
                SYNC
              </Button>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          {statCards.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <CyberCard key={stat.title} variant="stat" className="animate-fade-in" style={{ animationDelay: `${index * 50}ms` }}>
                <CyberCardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className={cn("p-2 rounded-lg", stat.bgColor)}>
                      <Icon className={cn("h-4 w-4", stat.color)} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-2xl font-bold font-mono tabular-nums">
                      <CountUp 
                        end={stat.value} 
                        suffix={stat.isPercentage ? '%' : ''} 
                        decimals={stat.isPercentage ? 1 : 0}
                      />
                    </p>
                    <p className="text-[10px] font-mono text-muted-foreground tracking-wider">
                      {stat.title}
                    </p>
                  </div>
                </CyberCardContent>
              </CyberCard>
            );
          })}
        </div>

        {/* Follower Growth */}
        <div className="mb-8">
          <h2 className="text-sm font-mono text-muted-foreground tracking-wider mb-4">FOLLOWER GROWTH</h2>
          <FollowerGrowthChart
            publisherId={publisher.id}
            timeRange={timeRange}
            onTimeRangeChange={setTimeRange}
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

        {/* Top Posts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <TopPostsLeaderboard posts={topPosts} isLoading={isLoading} />
          
          {/* Recent Posts */}
          <CyberCard>
            <CyberCardHeader>
              <CyberCardTitle>Recent Activity</CyberCardTitle>
            </CyberCardHeader>
            <CyberCardContent>
              <div className="space-y-3">
              {topPosts.slice(0, 5).map((post, index) => (
                  <div 
                    key={post.id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/30"
                  >
                    <span className="w-6 h-6 rounded bg-primary/20 flex items-center justify-center text-xs font-mono text-primary">
                      {index + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{post.content.substring(0, 60)}...</p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {post.publisherName}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-mono font-bold">{(post.impressions || 0).toLocaleString()}</p>
                      <p className="text-[10px] text-muted-foreground uppercase">impressions</p>
                    </div>
                  </div>
                ))}
                {topPosts.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <p className="font-mono">No published posts yet</p>
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

export default PublisherAnalytics;
