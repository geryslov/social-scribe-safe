import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { scrapeLinkedInProfile } from '@/lib/linkedin';

export interface Publisher {
  id: string;
  name: string;
  role: string | null;
  linkedin_url: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
  // LinkedIn OAuth fields
  linkedin_connected: boolean | null;
  linkedin_member_id: string | null;
  linkedin_token_expires_at: string | null;
}

export function usePublishers() {
  const queryClient = useQueryClient();

  const { data: publishers = [], isLoading } = useQuery({
    queryKey: ['publishers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('publishers')
        .select('*')
        .order('name');
      
      if (error) throw error;
      return data as Publisher[];
    },
  });

  const upsertPublisher = useMutation({
    mutationFn: async (publisher: { name: string; role?: string; linkedin_url?: string; avatar_url?: string }) => {
      const { data, error } = await supabase
        .from('publishers')
        .upsert(
          { 
            name: publisher.name,
            role: publisher.role || null,
            linkedin_url: publisher.linkedin_url || null,
            avatar_url: publisher.avatar_url || null,
          },
          { onConflict: 'name' }
        )
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['publishers'] });
    },
    onError: (error) => {
      console.error('Error upserting publisher:', error);
      toast.error('Failed to update publisher');
    },
  });

  const uploadAvatar = useMutation({
    mutationFn: async ({ publisherName, file }: { publisherName: string; file: File }) => {
      const fileExt = file.name.split('.').pop();
      const fileName = `${publisherName.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.${fileExt}`;
      const filePath = `avatars/${fileName}`;

      // Upload file to storage
      const { error: uploadError } = await supabase.storage
        .from('publisher-avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('publisher-avatars')
        .getPublicUrl(filePath);

      // Update publisher with new avatar URL
      const { data, error } = await supabase
        .from('publishers')
        .upsert(
          { name: publisherName, avatar_url: publicUrl },
          { onConflict: 'name' }
        )
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['publishers'] });
      toast.success('Avatar updated successfully');
    },
    onError: (error) => {
      console.error('Error uploading avatar:', error);
      toast.error('Failed to upload avatar');
    },
  });

  const getPublisherByName = (name: string) => {
    return publishers.find(p => p.name === name);
  };

  const fetchLinkedInPhoto = useMutation({
    mutationFn: async (publisherName: string) => {
      const publisher = publishers.find(p => p.name === publisherName);
      if (!publisher?.linkedin_url) {
        throw new Error('No LinkedIn URL configured for this publisher');
      }

      const result = await scrapeLinkedInProfile(publisher.linkedin_url);
      
      if (!result.success) {
        // Check if it's the "not supported" error from Firecrawl
        if (result.error?.includes('not currently supported')) {
          throw new Error('LinkedIn photo fetching requires a Firecrawl enterprise account. Please upload the photo manually.');
        }
        throw new Error(result.error || 'Could not fetch LinkedIn photo');
      }
      
      if (!result.data?.imageUrl) {
        throw new Error('No photo found on LinkedIn profile');
      }

      // Update publisher with the fetched avatar URL
      const { data, error } = await supabase
        .from('publishers')
        .update({ avatar_url: result.data.imageUrl })
        .eq('name', publisherName)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['publishers'] });
      toast.success('LinkedIn photo fetched successfully');
    },
    onError: (error) => {
      console.error('Error fetching LinkedIn photo:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to fetch LinkedIn photo');
    },
  });

  const deletePublisher = useMutation({
    mutationFn: async (publisherName: string) => {
      const { error } = await supabase
        .from('publishers')
        .delete()
        .eq('name', publisherName);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['publishers'] });
      toast.success('Publisher deleted');
    },
    onError: (error) => {
      console.error('Error deleting publisher:', error);
      toast.error('Failed to delete publisher');
    },
  });

  return {
    publishers,
    isLoading,
    upsertPublisher,
    uploadAvatar,
    fetchLinkedInPhoto,
    deletePublisher,
    getPublisherByName,
  };
}
