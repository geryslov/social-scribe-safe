import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Upload, Search, FileText, Loader2 } from 'lucide-react';
import { Header } from '@/components/Header';
import { DocumentCard } from '@/components/DocumentCard';
import { DocumentUploadModal } from '@/components/DocumentUploadModal';
import { DocumentSplitModal } from '@/components/DocumentSplitModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDocuments, useDocumentSections } from '@/hooks/useDocuments';
import { usePosts } from '@/hooks/usePosts';
import { usePublishers } from '@/hooks/usePublishers';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useAuth } from '@/hooks/useAuth';
import { Document, DocumentStatus } from '@/types/document';
import { toast } from 'sonner';

const statusFilters: Array<{ value: DocumentStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'in_review', label: 'In Review' },
  { value: 'approved', label: 'Approved' },
  { value: 'split', label: 'Split' },
];

export default function DocumentLibrary() {
  const navigate = useNavigate();
  const { documents, isLoading, isAdmin, createDocument, deleteDocument, updateStatus } = useDocuments();
  const { createPost } = usePosts();
  const { publishers } = usePublishers();
  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();
  const canUseAiCreate = user?.email === 'geryslov@gmail.com';

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<DocumentStatus | 'all'>('all');
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [splitModalOpen, setSplitModalOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);

  // Fetch sections for the selected document when split modal is open
  const { sections: selectedDocSections } = useDocumentSections(selectedDocument?.id || '');

  const filteredDocuments = useMemo(() => {
    return documents.filter(doc => {
      const matchesSearch = doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           doc.content.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || doc.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [documents, searchQuery, statusFilter]);

  const handleCreateDocument = async (data: {
    title: string;
    content: string;
    fileName?: string;
    fileUrl?: string
  }) => {
    const doc = await createDocument.mutateAsync(data);
    // Navigate to the document editor where sections are shown with editing & history
    navigate(`/documents/${doc.id}`);
  };

  const handleDeleteDocument = async (id: string) => {
    if (confirm('Are you sure you want to delete this document?')) {
      await deleteDocument.mutateAsync(id);
    }
  };

  const handleSplitDocument = (document: Document) => {
    setSelectedDocument(document);
    setSplitModalOpen(true);
  };

  const handleSavePosts = async (posts: Array<{
    content: string;
    publisherName: string;
    publisherRole: string;
    linkedinUrl: string;
    scheduledDate: string;
    documentId: string;
  }>) => {
    try {
      for (const post of posts) {
        await createPost.mutateAsync({
          content: post.content,
          publisherName: post.publisherName,
          publisherRole: post.publisherRole,
          linkedinUrl: post.linkedinUrl,
          scheduledDate: post.scheduledDate,
          status: 'draft',
          documentId: post.documentId,
        });
      }

      if (selectedDocument) {
        await updateStatus.mutateAsync({ id: selectedDocument.id, status: 'split' });
      }

      toast.success(`Created ${posts.length} posts from document`);
      setSplitModalOpen(false);
      setSelectedDocument(null);
    } catch (error) {
      console.error('Error creating posts:', error);
      toast.error('Failed to create posts');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main id="main-content" className="px-8 py-6 max-w-6xl mx-auto">

        {/* Page header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <p className="section-heading mb-2">Content Pipeline</p>
            <h1 className="text-4xl font-display font-extrabold tracking-tight">Documents</h1>
            <p className="text-sm text-muted-foreground mt-2">Long-form content to LinkedIn posts</p>
          </div>
          {isAdmin && (
            <Button className="bg-primary text-white hover:bg-primary/90 rounded-xl gap-2" onClick={() => setUploadModalOpen(true)}>
              <Plus className="h-4 w-4" /> New Document
            </Button>
          )}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-8">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="pl-9 rounded-xl bg-muted border-border"
            />
          </div>
          <Tabs
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as DocumentStatus | 'all')}
          >
            <TabsList className="bg-muted rounded-xl">
              {statusFilters.map(f => (
                <TabsTrigger key={f.value} value={f.value} className="rounded-lg text-xs">{f.label}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {/* Document Grid */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading documents...</p>
          </div>
        ) : filteredDocuments.length === 0 ? (
          <div className="text-center py-24">
            <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-primary flex items-center justify-center">
              <FileText className="h-7 w-7 text-white" />
            </div>
            <h3 className="text-xl font-display font-bold mb-2">No documents yet</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-6">
              {searchQuery || statusFilter !== 'all'
                ? 'Try adjusting your filters'
                : 'Upload long-form content to split into LinkedIn posts'
              }
            </p>
            {isAdmin && !searchQuery && statusFilter === 'all' && (
              <Button
                variant="outline"
                className="rounded-xl gap-2"
                onClick={() => setUploadModalOpen(true)}
              >
                <Upload className="h-4 w-4" />
                Upload Document
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredDocuments.map(document => (
              <DocumentCard
                key={document.id}
                document={document}
                publisher={publishers.find(p => p.id === document.publisherId)}
                isAdmin={isAdmin}
                onEdit={(id) => navigate(`/documents/${id}`)}
                onDelete={handleDeleteDocument}
                onSplit={handleSplitDocument}
              />
            ))}
          </div>
        )}
      </main>

      <DocumentUploadModal
        open={uploadModalOpen}
        onOpenChange={setUploadModalOpen}
        onSave={handleCreateDocument}
        showAiCreate={canUseAiCreate}
      />

      <DocumentSplitModal
        open={splitModalOpen}
        onOpenChange={setSplitModalOpen}
        document={selectedDocument}
        sections={selectedDocSections}
        onSave={handleSavePosts}
      />
    </div>
  );
}
