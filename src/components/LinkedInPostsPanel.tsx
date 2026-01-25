import { useState, useEffect } from 'react';
import { RefreshCw, ExternalLink, Eye, Heart, MessageCircle, Share2, TrendingUp, KeyRound, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useLinkedInPosts, LinkedInPost } from '@/hooks/useLinkedInPosts';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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
  const { posts, isLoading, syncPosts, isSyncing, lastSyncedAt, stats, error } = useLinkedInPosts(publisherId);
  const [isReauthenticating, setIsReauthenticating] = useState(false);
  const [showReauthPrompt, setShowReauthPrompt] = useState(false);

  // Listen for OAuth callback messages
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'linkedin-auth-success') {
        setIsReauthenticating(false);
        setShowReauthPrompt(false);
        toast.success('LinkedIn permissions updated! Syncing posts...');
        // Trigger sync after re-auth
        setTimeout(() => syncPosts.mutate(), 1000);
      } else if (event.data?.type === 'linkedin-auth-error') {
        setIsReauthenticating(false);
        toast.error(event.data.error || 'Failed to update LinkedIn permissions');
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [syncPosts]);

  // Show re-auth prompt if sync fails or no posts after first sync attempt
  useEffect(() => {
    if (error && error.message?.includes('Failed to fetch LinkedIn posts')) {
      setShowReauthPrompt(true);
    }
  }, [error]);

  const handleReauthenticate = () => {
    if (!publisherId) return;
    
    setIsReauthenticating(true);
    
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const authUrl = `${supabaseUrl}/functions/v1/linkedin-auth/start?publisher_id=${publisherId}`;
    
    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    
    const popup = window.open(
      authUrl,
      'linkedin-auth',
      `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no`
    );

    if (!popup) {
      setIsReauthenticating(false);
      toast.error('Popup blocked. Please allow popups for this site.');
      return;
    }

    const pollTimer = setInterval(() => {
      if (popup.closed) {
        clearInterval(pollTimer);
        setIsReauthenticating(false);
      }
    }, 500);
  };

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
        {/* Re-authentication prompt for new permissions */}
        {(showReauthPrompt || (posts.length === 0 && !isLoading && !isSyncing)) && (
          <Alert className="mb-4 border-primary/30 bg-primary/5">
            <KeyRound className="h-4 w-4 text-primary" />
            <AlertDescription className="ml-2">
              <p className="text-sm font-medium mb-2">New permissions required</p>
              <p className="text-xs text-muted-foreground mb-3">
                To fetch your LinkedIn posts and analytics, please re-authenticate to grant the required permissions.
              </p>
              <Button
                size="sm"
                onClick={handleReauthenticate}
                disabled={isReauthenticating}
                className="gap-2"
              >
                {isReauthenticating ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <KeyRound className="h-3 w-3" />
                )}
                {isReauthenticating ? 'Authenticating...' : 'Update Permissions'}
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : posts.length === 0 && !showReauthPrompt ? (
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
        ) : posts.length > 0 ? (
          <>
            <StatsOverview stats={stats} />
            <ScrollArea className="h-[300px] pr-4">
              {posts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </ScrollArea>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
