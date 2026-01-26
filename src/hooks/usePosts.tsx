import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Post } from '@/types/post';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

type DbPost = {
  id: string;
  content: string;
  status: string;
  scheduled_date: string;
  publisher_name: string;
  publisher_role: string | null;
  linkedin_url: string | null;
  labels: string[] | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  document_id: string | null;
  // LinkedIn publishing tracking
  published_at: string | null;
  linkedin_post_url: string | null;
  publish_method: string | null;
  // Post metadata
  post_type: string | null;
  media_urns: string[] | null;
  // Analytics fields
  impressions: number | null;
  unique_impressions: number | null;
  reactions: number | null;
  comments_count: number | null;
  reshares: number | null;
  engagement_rate: number | null;
  analytics_fetched_at: string | null;
  // Reaction breakdown
  reaction_like: number | null;
  reaction_celebrate: number | null;
  reaction_support: number | null;
  reaction_love: number | null;
  reaction_insightful: number | null;
  reaction_curious: number | null;
  // Conversation metrics
  avg_reply_depth: number | null;
  thread_count: number | null;
  // Link analytics
  link_clicks: number | null;
  click_through_rate: number | null;
  // Video metrics
  video_views: number | null;
  video_unique_viewers: number | null;
  video_watch_time_seconds: number | null;
  video_completion_rate: number | null;
  video_milestone_25: number | null;
  video_milestone_50: number | null;
  video_milestone_75: number | null;
  video_milestone_100: number | null;
};

function mapDbToPost(dbPost: DbPost): Post {
  // Build reaction breakdown if any reactions exist
  const hasReactionBreakdown = dbPost.reaction_like || dbPost.reaction_celebrate || 
    dbPost.reaction_support || dbPost.reaction_love || 
    dbPost.reaction_insightful || dbPost.reaction_curious;
  
  const reactionBreakdown = hasReactionBreakdown ? {
    like: dbPost.reaction_like || 0,
    celebrate: dbPost.reaction_celebrate || 0,
    support: dbPost.reaction_support || 0,
    love: dbPost.reaction_love || 0,
    insightful: dbPost.reaction_insightful || 0,
    curious: dbPost.reaction_curious || 0,
  } : null;

  // Build video metrics if any video data exists
  const hasVideoMetrics = dbPost.video_views && dbPost.video_views > 0;
  
  const videoMetrics = hasVideoMetrics ? {
    views: dbPost.video_views || 0,
    uniqueViewers: dbPost.video_unique_viewers || 0,
    watchTimeSeconds: dbPost.video_watch_time_seconds || 0,
    completionRate: dbPost.video_completion_rate,
    milestone25: dbPost.video_milestone_25 || 0,
    milestone50: dbPost.video_milestone_50 || 0,
    milestone75: dbPost.video_milestone_75 || 0,
    milestone100: dbPost.video_milestone_100 || 0,
  } : null;

  return {
    id: dbPost.id,
    content: dbPost.content,
    status: dbPost.status as Post['status'],
    scheduledDate: dbPost.scheduled_date,
    publisherName: dbPost.publisher_name,
    publisherRole: dbPost.publisher_role || '',
    linkedinUrl: dbPost.linkedin_url || '',
    labels: dbPost.labels || [],
    documentId: dbPost.document_id,
    publishedAt: dbPost.published_at,
    linkedinPostUrl: dbPost.linkedin_post_url,
    publishMethod: dbPost.publish_method as Post['publishMethod'],
    // Post metadata
    postType: dbPost.post_type as Post['postType'],
    mediaUrns: dbPost.media_urns,
    // Analytics fields
    impressions: dbPost.impressions,
    unique_impressions: dbPost.unique_impressions,
    reactions: dbPost.reactions,
    comments_count: dbPost.comments_count,
    reshares: dbPost.reshares,
    engagement_rate: dbPost.engagement_rate,
    // Reaction breakdown
    reactionBreakdown,
    // Conversation metrics
    avgReplyDepth: dbPost.avg_reply_depth,
    threadCount: dbPost.thread_count,
    // Link analytics
    linkClicks: dbPost.link_clicks,
    clickThroughRate: dbPost.click_through_rate,
    // Video metrics
    videoMetrics,
  };
}

export function usePosts() {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();

  const { data: posts = [], isLoading } = useQuery({
    queryKey: ['posts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .order('scheduled_date', { ascending: false });
      
      if (error) throw error;
      return (data as DbPost[]).map(mapDbToPost);
    },
  });

  const createPost = useMutation({
    mutationFn: async (post: Omit<Post, 'id'>) => {
      if (!user) throw new Error('Must be logged in');
      
      const { data, error } = await supabase
        .from('posts')
        .insert({
          content: post.content,
          status: post.status,
          scheduled_date: post.scheduledDate,
          publisher_name: post.publisherName,
          publisher_role: post.publisherRole || null,
          linkedin_url: post.linkedinUrl || null,
          created_by: user.id,
          document_id: post.documentId || null,
        })
        .select()
        .single();
      
      if (error) throw error;
      
      const createdPost = mapDbToPost(data as DbPost);
      
      // Auto-analyze post for labels in background
      supabase.functions.invoke('analyze-post', {
        body: { content: post.content },
      }).then(({ data: analyzeData }) => {
        if (analyzeData?.success && analyzeData?.labels?.length > 0) {
          supabase
            .from('posts')
            .update({ labels: analyzeData.labels })
            .eq('id', createdPost.id)
            .then(() => {
              queryClient.invalidateQueries({ queryKey: ['posts'] });
            });
        }
      }).catch(console.error);
      
      return createdPost;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      toast.success('Post created');
    },
    onError: (error: Error) => {
      if (error.message.includes('row-level security')) {
        toast.error('Only admins can create posts');
      } else {
        toast.error('Failed to create post');
      }
    },
  });

  const updatePost = useMutation({
    mutationFn: async ({ post, previousPost }: { post: Post; previousPost: Post }) => {
      // Record the edit history (works for both guests and logged-in users)
      if (post.content !== previousPost.content || post.status !== previousPost.status) {
        await supabase.from('post_edit_history').insert({
          post_id: post.id,
          edited_by: user?.id || null,
          edited_by_email: user?.email || 'Guest',
          previous_content: previousPost.content,
          new_content: post.content,
          previous_status: previousPost.status,
          new_status: post.status,
        });
      }

      const { data, error } = await supabase
        .from('posts')
        .update({
          content: post.content,
          status: post.status,
          scheduled_date: post.scheduledDate,
          publisher_name: post.publisherName,
          publisher_role: post.publisherRole || null,
          linkedin_url: post.linkedinUrl || null,
        })
        .eq('id', post.id)
        .select()
        .single();
      
      if (error) throw error;
      return mapDbToPost(data as DbPost);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['edit-history'] });
      toast.success('Post updated');
    },
    onError: () => {
      toast.error('Failed to update post');
    },
  });

  const deletePost = useMutation({
    mutationFn: async (postId: string) => {
      const { error } = await supabase
        .from('posts')
        .delete()
        .eq('id', postId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      toast.success('Post deleted');
    },
    onError: (error: Error) => {
      if (error.message.includes('row-level security')) {
        toast.error('Only admins can delete posts');
      } else {
        toast.error('Failed to delete post');
      }
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ postId, status, publisherName }: { postId: string; status: Post['status']; publisherName?: string }) => {
      const { error } = await supabase
        .from('posts')
        .update({ status })
        .eq('id', postId);
      
      if (error) throw error;

      // Send Slack notification when post is published
      if (status === 'done' && publisherName) {
        supabase.functions.invoke('notify-slack', {
          body: {
            workspaceName: 'Wisor',
            publisherName,
            publishedAt: new Date().toISOString(),
            workspaceUrl: window.location.origin,
          },
        }).catch((err) => {
          console.error('Failed to send Slack notification:', err);
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posts'] });
    },
    onError: (error: Error) => {
      if (error.message.includes('row-level security')) {
        toast.error('Only admins can update posts');
      } else {
        toast.error('Failed to update status');
      }
    },
  });

  const updateLabels = useMutation({
    mutationFn: async ({ postId, labels }: { postId: string; labels: string[] }) => {
      const { error } = await supabase
        .from('posts')
        .update({ labels })
        .eq('id', postId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posts'] });
    },
    onError: () => {
      toast.error('Failed to update labels');
    },
  });

  return {
    posts,
    isLoading,
    isAdmin,
    createPost,
    updatePost,
    deletePost,
    updateStatus,
    updateLabels,
  };
}
