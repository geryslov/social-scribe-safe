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
      
      const document = mapDbToDocument(result as DbDocument);
      
      // Parse and create sections for each "Post" in the content
      const sections = parsePostSections(data.content);
      if (sections.length > 0) {
        const sectionsToInsert = sections.map((content, index) => ({
          document_id: document.id,
          section_number: index + 1,
          content,
          status: 'pending',
        }));
        
        const { error: sectionsError } = await supabase
          .from('document_sections')
          .insert(sectionsToInsert);
        
        if (sectionsError) {
          console.error('Error creating sections:', sectionsError);
        }
      }
      
      return document;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      toast.success('Document created');
    },
    onError: (error) => {
      toast.error('Failed to create document: ' + error.message);
    },
  });

// Helper function to parse "Post" sections from content
function parsePostSections(content: string): string[] {
  const sections: string[] = [];
  const lines = content.split('\n');
  let currentSection: string[] = [];
  let foundFirstPost = false;
  
  const excludedPatterns = [
    /^data\s*sources?/i,
    /^appendix/i,
    /^references?/i,
    /^sources?:/i,
  ];
  
  const isExcluded = (line: string) => excludedPatterns.some(p => p.test(line.trim()));
  let inExcludedSection = false;

  for (const line of lines) {
    const isPostMarker = /^Post\s*\d+/i.test(line.trim());
    
    if (isExcluded(line)) {
      inExcludedSection = true;
      continue;
    }
    
    if (isPostMarker) {
      inExcludedSection = false;
      if (currentSection.length > 0 && foundFirstPost) {
        sections.push(currentSection.join('\n').trim());
      }
      currentSection = [];
      foundFirstPost = true;
    } else if (foundFirstPost && !inExcludedSection) {
      currentSection.push(line);
    }
  }

  if (currentSection.length > 0 && foundFirstPost) {
    sections.push(currentSection.join('\n').trim());
  }

  return sections.filter(s => s.length > 0);
}

  const updateDocument = useMutation({
    mutationFn: async (data: { 
      id: string; 
      title?: string; 
      content?: string; 
      notes?: string;
    }) => {
      // Fetch current document to track changes
      const { data: currentDoc, error: fetchError } = await supabase
        .from('documents')
        .select('title, content, status')
        .eq('id', data.id)
        .single();
      
      if (fetchError) throw fetchError;

      const updates: Record<string, unknown> = {};
      if (data.title !== undefined) updates.title = data.title;
      if (data.content !== undefined) updates.content = data.content;
      if (data.notes !== undefined) updates.notes = data.notes;
      
      const { error } = await supabase
        .from('documents')
        .update(updates)
        .eq('id', data.id);
      
      if (error) throw error;

      // Record edit history if content or title changed
      const titleChanged = data.title !== undefined && data.title !== currentDoc.title;
      const contentChanged = data.content !== undefined && data.content !== currentDoc.content;
      
      if (titleChanged || contentChanged) {
        await supabase.from('document_edit_history').insert({
          document_id: data.id,
          edited_by: user?.id || null,
          edited_by_email: user?.email || 'Unknown',
          previous_content: currentDoc.content,
          new_content: data.content ?? currentDoc.content,
          previous_title: currentDoc.title,
          new_title: data.title ?? currentDoc.title,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['document-edit-history'] });
      toast.success('Document saved');
    },
    onError: (error) => {
      toast.error('Failed to save document: ' + error.message);
    },
  });

  const updateStatus = useMutation({
    mutationFn: async (data: { id: string; status: DocumentStatus }) => {
      // Fetch current document to track changes
      const { data: currentDoc, error: fetchError } = await supabase
        .from('documents')
        .select('title, content, status')
        .eq('id', data.id)
        .single();
      
      if (fetchError) throw fetchError;

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

      // Record status change in edit history
      if (currentDoc.status !== data.status) {
        await supabase.from('document_edit_history').insert({
          document_id: data.id,
          edited_by: user?.id || null,
          edited_by_email: user?.email || 'Unknown',
          previous_content: currentDoc.content,
          new_content: currentDoc.content,
          previous_status: currentDoc.status,
          new_status: data.status,
          previous_title: currentDoc.title,
          new_title: currentDoc.title,
        });
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['document-edit-history'] });
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

export interface DocumentSection {
  id: string;
  documentId: string;
  sectionNumber: number;
  content: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface DbSection {
  id: string;
  document_id: string;
  section_number: number;
  content: string;
  status: string;
  created_at: string;
  updated_at: string;
}

const mapDbToSection = (db: DbSection): DocumentSection => ({
  id: db.id,
  documentId: db.document_id,
  sectionNumber: db.section_number,
  content: db.content,
  status: db.status,
  createdAt: db.created_at,
  updatedAt: db.updated_at,
});

export function useDocumentSections(documentId: string) {
  const queryClient = useQueryClient();

  const { data: sections = [], isLoading } = useQuery({
    queryKey: ['document-sections', documentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('document_sections')
        .select('*')
        .eq('document_id', documentId)
        .order('section_number', { ascending: true });
      
      if (error) throw error;
      return (data as DbSection[]).map(mapDbToSection);
    },
    enabled: !!documentId,
  });

  const updateSection = useMutation({
    mutationFn: async (data: { id: string; content?: string; status?: string }) => {
      // Fetch current section to track changes
      const { data: currentSection, error: fetchError } = await supabase
        .from('document_sections')
        .select('content, status, document_id')
        .eq('id', data.id)
        .single();
      
      if (fetchError) throw fetchError;

      const updates: Record<string, unknown> = {};
      if (data.content !== undefined) updates.content = data.content;
      if (data.status !== undefined) updates.status = data.status;
      
      const { error } = await supabase
        .from('document_sections')
        .update(updates)
        .eq('id', data.id);
      
      if (error) throw error;

      // Record edit history if content or status changed
      const contentChanged = data.content !== undefined && data.content !== currentSection.content;
      const statusChanged = data.status !== undefined && data.status !== currentSection.status;
      
      if (contentChanged || statusChanged) {
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from('section_edit_history').insert({
          section_id: data.id,
          document_id: currentSection.document_id,
          edited_by: user?.id || null,
          edited_by_email: user?.email || 'Unknown',
          previous_content: currentSection.content,
          new_content: data.content ?? currentSection.content,
          previous_status: currentSection.status,
          new_status: data.status ?? currentSection.status,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-sections', documentId] });
      queryClient.invalidateQueries({ queryKey: ['section-edit-history'] });
      toast.success('Section updated');
    },
    onError: (error) => {
      toast.error('Failed to update section: ' + error.message);
    },
  });

  const deleteSection = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('document_sections')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-sections', documentId] });
      toast.success('Section deleted');
    },
    onError: (error) => {
      toast.error('Failed to delete section: ' + error.message);
    },
  });

  return { sections, isLoading, updateSection, deleteSection };
}
