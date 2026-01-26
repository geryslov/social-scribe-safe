import { Eye, Heart, ExternalLink, Trophy } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TopPost } from '@/hooks/useAnalytics';
import { cn } from '@/lib/utils';

interface TopPostsLeaderboardProps {
  posts: TopPost[];
  isLoading?: boolean;
}

const rankColors = [
  'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  'bg-gray-400/20 text-gray-300 border-gray-400/30',
  'bg-amber-600/20 text-amber-400 border-amber-600/30',
  'bg-muted text-muted-foreground border-border',
  'bg-muted text-muted-foreground border-border',
];

export function TopPostsLeaderboard({ posts, isLoading }: TopPostsLeaderboardProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-400" />
            Top Performing Posts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse h-16 bg-muted/50 rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (posts.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-400" />
            Top Performing Posts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <p>No posts with engagement data yet</p>
            <p className="text-sm mt-1">Sync analytics to see rankings</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Trophy className="h-5 w-5 text-yellow-400" />
          Top Performing Posts
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {posts.map((post, index) => (
          <div
            key={post.id}
            className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors group"
          >
            <div className={cn(
              "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border",
              rankColors[index] || rankColors[4]
            )}>
              {index + 1}
            </div>
            
            <div className="flex-1 min-w-0">
              <p className="text-sm line-clamp-2 text-foreground mb-2">
                {post.content.substring(0, 100)}{post.content.length > 100 ? '...' : ''}
              </p>
              
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="font-medium text-foreground/80">{post.publisherName}</span>
                <div className="flex items-center gap-1">
                  <Eye className="h-3 w-3" />
                  <span>{post.impressions.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Heart className="h-3 w-3" />
                  <span>{post.reactions}</span>
                </div>
              </div>
            </div>
            
            <div className="flex flex-col items-end gap-2">
              <Badge variant="secondary" className="bg-success/10 text-success border-success/20">
                {post.engagementRate.toFixed(1)}%
              </Badge>
              {post.linkedinUrl && (
                <a
                  href={post.linkedinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:text-primary/80 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
