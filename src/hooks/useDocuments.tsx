import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Document, DocumentComment, DocumentStatus } from '@/types/document';
import { toast } from 'sonner';
import { useAuth } from './useAuth';

interface DbDocument {
  id: string;
  title: string;
  content: string;
  original_content: string;
  status: string;
  file_name: string | null;
  file_url: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  approved_by: string | null;
  approved_at: string | null;
  notes: string | null;
}

interface DbComment {
  id: string;
  document_id: string;
  user_id: string | null;
  user_email: string;
  content: string;
  created_at: string;
}

const mapDbToDocument = (db: DbDocument): Document => ({
  id: db.id,
  title: db.title,
  content: db.content,
  originalContent: db.original_content,
  status: db.status as DocumentStatus,
  fileName: db.file_name,
  fileUrl: db.file_url,
  createdBy: db.created_by,
  createdAt: db.created_at,
  updatedAt: db.updated_at,
  approvedBy: db.approved_by,
  approvedAt: db.approved_at,
  notes: db.notes,
});

const mapDbToComment = (db: DbComment): DocumentComment => ({
  id: db.id,
  documentId: db.document_id,
  userId: db.user_id,
  userEmail: db.user_email,
  content: db.content,
  createdAt: db.created_at,
});

export function useDocuments() {
  const queryClient = useQueryClient();
  const { user, isAdmin } = useAuth();

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['documents'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return (data as DbDocument[]).map(mapDbToDocument);
    },
  });

  const createDocument = useMutation({
    mutationFn: async (data: { 
      title: string; 
      content: string; 
      fileName?: string;
      fileUrl?: string;
    }) => {
      if (!user) throw new Error('Not authenticated');
      
      const { data: result, error } = await supabase
        .from('documents')
        .insert({
          title: data.title,
          content: data.content,
          original_content: data.content,
          file_name: data.fileName || null,
          file_url: data.fileUrl || null,
          created_by: user.id,
          status: 'draft',
        })
        .select()
        .single();
      
      if (error) throw error;
      return mapDbToDocument(result as DbDocument);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      toast.success('Document created');
    },
    onError: (error) => {
      toast.error('Failed to create document: ' + error.message);
    },
  });

  const updateDocument = useMutation({
    mutationFn: async (data: { 
      id: string; 
      title?: string; 
      content?: string; 
      notes?: string;
    }) => {
      const updates: Record<string, unknown> = {};
      if (data.title !== undefined) updates.title = data.title;
      if (data.content !== undefined) updates.content = data.content;
      if (data.notes !== undefined) updates.notes = data.notes;
      
      const { error } = await supabase
        .from('documents')
        .update(updates)
        .eq('id', data.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      toast.success('Document saved');
    },
    onError: (error) => {
      toast.error('Failed to save document: ' + error.message);
    },
  });

  const updateStatus = useMutation({
    mutationFn: async (data: { id: string; status: DocumentStatus }) => {
      const updates: Record<string, unknown> = { status: data.status };
      
      if (data.status === 'approved' && user) {
        updates.approved_by = user.id;
        updates.approved_at = new Date().toISOString();
      }
      
      const { error } = await supabase
        .from('documents')
        .update(updates)
        .eq('id', data.id);
      
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      const statusMessages: Record<DocumentStatus, string> = {
        draft: 'Document moved to draft',
        in_review: 'Document submitted for review',
        approved: 'Document approved',
        split: 'Document marked as split',
      };
      toast.success(statusMessages[variables.status]);
    },
    onError: (error) => {
      toast.error('Failed to update status: ' + error.message);
    },
  });

  const deleteDocument = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('documents')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      toast.success('Document deleted');
    },
    onError: (error) => {
      toast.error('Failed to delete document: ' + error.message);
    },
  });

  const uploadFile = useMutation({
    mutationFn: async (file: File) => {
      const fileName = `${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileName, file);
      
      if (uploadError) throw uploadError;
      
      const { data: urlData } = supabase.storage
        .from('documents')
        .getPublicUrl(fileName);
      
      return {
        fileName: file.name,
        fileUrl: urlData.publicUrl,
      };
    },
    onError: (error) => {
      toast.error('Failed to upload file: ' + error.message);
    },
  });

  return {
    documents,
    isLoading,
    isAdmin,
    createDocument,
    updateDocument,
    updateStatus,
    deleteDocument,
    uploadFile,
  };
}

export function useDocument(id: string) {
  const { data: document, isLoading } = useQuery({
    queryKey: ['documents', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('id', id)
        .single();
      
      if (error) throw error;
      return mapDbToDocument(data as DbDocument);
    },
    enabled: !!id,
  });

  return { document, isLoading };
}

export function useDocumentComments(documentId: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: comments = [], isLoading } = useQuery({
    queryKey: ['document-comments', documentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('document_comments')
        .select('*')
        .eq('document_id', documentId)
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      return (data as DbComment[]).map(mapDbToComment);
    },
    enabled: !!documentId,
  });

  const addComment = useMutation({
    mutationFn: async (content: string) => {
      const { error } = await supabase
        .from('document_comments')
        .insert({
          document_id: documentId,
          user_id: user?.id || null,
          user_email: user?.email || 'Anonymous',
          content,
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-comments', documentId] });
    },
    onError: (error) => {
      toast.error('Failed to add comment: ' + error.message);
    },
  });

  return { comments, isLoading, addComment };
}

export function useDocumentPosts(documentId: string) {
  const { data: posts = [], isLoading } = useQuery({
    queryKey: ['document-posts', documentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .eq('document_id', documentId)
        .order('scheduled_date', { ascending: true });
      
      if (error) throw error;
      return data;
    },
    enabled: !!documentId,
  });

  return { posts, isLoading };
}
