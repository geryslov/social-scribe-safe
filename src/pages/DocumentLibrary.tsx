import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Upload, Search, FileText, Filter } from 'lucide-react';
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
      
      <main className="px-8 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Document Library</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage your content documents and split them into posts
            </p>
          </div>
          
{isAdmin && (
            <Button variant="glow" className="text-accent" onClick={() => setUploadModalOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Document
            </Button>
          )}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search documents..."
              className="pl-10"
            />
          </div>

          <Tabs 
            value={statusFilter} 
            onValueChange={(v) => setStatusFilter(v as DocumentStatus | 'all')}
          >
            <TabsList>
              {statusFilters.map(filter => (
                <TabsTrigger key={filter.value} value={filter.value}>
                  {filter.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {/* Document Grid */}
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">
            Loading documents...
          </div>
        ) : filteredDocuments.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-medium text-foreground mb-1">No documents found</h3>
            <p className="text-sm text-muted-foreground">
              {searchQuery || statusFilter !== 'all' 
                ? 'Try adjusting your filters'
                : 'Upload your first document to get started'
              }
            </p>
            {isAdmin && !searchQuery && statusFilter === 'all' && (
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={() => setUploadModalOpen(true)}
              >
                <Upload className="h-4 w-4 mr-2" />
                Upload Document
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
