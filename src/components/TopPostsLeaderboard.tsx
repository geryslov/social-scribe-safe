import { Trophy } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TopPost } from '@/hooks/useAnalytics';
import { LinkedInPostCard } from '@/components/LinkedInPostCard';
import { Post } from '@/types/post';
import { usePublishers } from '@/hooks/usePublishers';

interface TopPostsLeaderboardProps {
  posts: TopPost[];
  isLoading?: boolean;
}

// Convert TopPost to Post format for LinkedInPostCard
function topPostToPost(topPost: TopPost): Post {
  return {
    id: topPost.id,
    publisherName: topPost.publisherName,
    publisherRole: '',
    linkedinUrl: topPost.linkedinUrl || '',
    content: topPost.content,
    scheduledDate: '',
    status: 'done',
    publishedAt: null,
    linkedinPostUrl: topPost.linkedinUrl,
    impressions: topPost.impressions,
    unique_impressions: Math.floor(topPost.impressions * 0.7), // Approximate
    reactions: topPost.reactions,
    engagement_rate: topPost.engagementRate,
  };
}

export function TopPostsLeaderboard({ posts, isLoading }: TopPostsLeaderboardProps) {
  const { publishers } = usePublishers();
  
  const getPublisherData = (publisherName: string) => {
    return publishers.find(p => p.name === publisherName);
  };
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Trophy className="h-5 w-5 text-warning" />
            Top Performing Posts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse h-48 bg-muted/50 rounded-lg" />
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
            <Trophy className="h-5 w-5 text-warning" />
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
            <Trophy className="h-5 w-5 text-warning" />
            Top Performing Posts
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {posts.slice(0, 3).map((post, index) => (
          <div key={post.id} className="relative">
            {/* Rank badge */}
            <div className="absolute -left-2 -top-2 z-10 w-6 h-6 rounded-full bg-warning text-warning-foreground flex items-center justify-center text-xs font-bold shadow-lg">
              {index + 1}
            </div>
            {(() => {
              const publisher = getPublisherData(post.publisherName);
              return (
                <LinkedInPostCard 
                  post={topPostToPost(post)} 
                  variant="feed"
                  showAnalytics={true}
                  publisherHeadline={publisher?.headline}
                  publisherCompany={publisher?.company_name}
                />
              );
            })()}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
