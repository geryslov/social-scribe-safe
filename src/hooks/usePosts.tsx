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
};

function mapDbToPost(dbPost: DbPost): Post {
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
