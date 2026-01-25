import { RefreshCw, ExternalLink, Eye, Heart, MessageCircle, Share2, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useLinkedInPosts, LinkedInPost } from '@/hooks/useLinkedInPosts';
import { formatDistanceToNow } from 'date-fns';

interface LinkedInPostsPanelProps {
  publisherId?: string;
  isLinkedInConnected?: boolean;
}

function PostCard({ post }: { post: LinkedInPost }) {
  const linkedInUrl = `https://www.linkedin.com/feed/update/${post.linkedin_post_urn}`;
  
  return (
    <Card className="mb-3">
      <CardContent className="pt-4">
        {/* Post content preview */}
        <p className="text-sm text-foreground line-clamp-3 mb-3">
          {post.content || <span className="text-muted-foreground italic">No text content</span>}
        </p>
        
        {/* Metrics row */}
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mb-2">
          {post.impressions > 0 && (
            <div className="flex items-center gap-1">
              <Eye className="h-3 w-3" />
              <span>{post.impressions.toLocaleString()}</span>
            </div>
          )}
          <div className="flex items-center gap-1">
            <Heart className="h-3 w-3" />
            <span>{post.reactions}</span>
          </div>
          <div className="flex items-center gap-1">
            <MessageCircle className="h-3 w-3" />
            <span>{post.comments}</span>
          </div>
          {post.reshares > 0 && (
            <div className="flex items-center gap-1">
              <Share2 className="h-3 w-3" />
              <span>{post.reshares}</span>
            </div>
          )}
          {post.engagement_rate !== null && post.engagement_rate > 0 && (
            <div className="flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              <span>{post.engagement_rate.toFixed(1)}%</span>
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            {post.published_at 
              ? formatDistanceToNow(new Date(post.published_at), { addSuffix: true })
              : 'Unknown date'}
          </span>
          <a 
            href={linkedInUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-primary hover:underline flex items-center gap-1"
          >
            View <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </CardContent>
    </Card>
  );
}

function StatsOverview({ stats }: { stats: ReturnType<typeof useLinkedInPosts>['stats'] }) {
  return (
    <div className="grid grid-cols-2 gap-2 mb-4">
      <div className="bg-muted/50 rounded-lg p-2 text-center">
        <div className="text-lg font-semibold">{stats.totalPosts}</div>
        <div className="text-xs text-muted-foreground">Posts</div>
      </div>
      <div className="bg-muted/50 rounded-lg p-2 text-center">
        <div className="text-lg font-semibold">{stats.totalReactions}</div>
        <div className="text-xs text-muted-foreground">Reactions</div>
      </div>
      <div className="bg-muted/50 rounded-lg p-2 text-center">
        <div className="text-lg font-semibold">{stats.totalComments}</div>
        <div className="text-xs text-muted-foreground">Comments</div>
      </div>
      <div className="bg-muted/50 rounded-lg p-2 text-center">
        <div className="text-lg font-semibold">
          {stats.totalImpressions > 0 ? stats.totalImpressions.toLocaleString() : '-'}
        </div>
        <div className="text-xs text-muted-foreground">Impressions</div>
      </div>
    </div>
  );
}

export function LinkedInPostsPanel({ publisherId, isLinkedInConnected }: LinkedInPostsPanelProps) {
  const { posts, isLoading, syncPosts, isSyncing, lastSyncedAt, stats } = useLinkedInPosts(publisherId);

  if (!isLinkedInConnected) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">LinkedIn Posts</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Connect to LinkedIn to view and sync your posts.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">LinkedIn Posts</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncPosts.mutate()}
            disabled={isSyncing}
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Syncing...' : 'Sync'}
          </Button>
        </div>
        {lastSyncedAt && (
          <p className="text-xs text-muted-foreground">
            Last synced {formatDistanceToNow(lastSyncedAt, { addSuffix: true })}
          </p>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-sm text-muted-foreground mb-3">
              No posts synced yet
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => syncPosts.mutate()}
              disabled={isSyncing}
            >
              <RefreshCw className={`h-3 w-3 mr-1 ${isSyncing ? 'animate-spin' : ''}`} />
              Sync Now
            </Button>
          </div>
        ) : (
          <>
            <StatsOverview stats={stats} />
            <ScrollArea className="h-[300px] pr-4">
              {posts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </ScrollArea>
          </>
        )}
      </CardContent>
    </Card>
  );
}
