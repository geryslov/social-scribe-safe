import { Split } from 'lucide-react';
import { format } from 'date-fns';

interface LinkedPost {
  id: string;
  content: string;
  publisher_name: string;
  scheduled_date: string;
}

interface LinkedPostCardProps {
  post: LinkedPost;
}

export function LinkedPostCard({ post }: LinkedPostCardProps) {
  return (
    <div className="text-sm p-2 bg-secondary/50 rounded-lg">
      <p className="truncate">{post.content.substring(0, 50)}...</p>
      <p className="text-xs text-muted-foreground mt-1">
        {post.publisher_name} · {format(new Date(post.scheduled_date), 'MMM d')}
      </p>
    </div>
  );
}

interface LinkedPostsListProps {
  posts: LinkedPost[];
}

export function LinkedPostsList({ posts }: LinkedPostsListProps) {
  if (posts.length === 0) return null;

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <h3 className="font-medium flex items-center gap-2 mb-3">
        <Split className="h-4 w-4 text-primary" />
        Linked Posts ({posts.length})
      </h3>
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {posts.map((post) => (
          <LinkedPostCard key={post.id} post={post} />
        ))}
      </div>
    </div>
  );
}
