import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Save, Send, CheckCircle, RotateCcw, Split, 
  FileText, Clock, MessageSquare, ExternalLink, Layers, User 
} from 'lucide-react';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { DocumentSplitModal } from '@/components/DocumentSplitModal';
import { LinkedPostsList } from '@/components/LinkedPostCard';
import { DocumentEditHistory } from '@/components/DocumentEditHistory';
import { DocumentSectionCard } from '@/components/DocumentSectionCard';
import { DocumentPublisherSelect } from '@/components/DocumentPublisherSelect';
import { useDocument, useDocuments, useDocumentComments, useDocumentPosts, useDocumentSections } from '@/hooks/useDocuments';
import { usePosts } from '@/hooks/usePosts';
import { DocumentStatus } from '@/types/document';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const statusConfig: Record<DocumentStatus, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'bg-muted text-muted-foreground' },
  in_review: { label: 'In Review', color: 'bg-yellow-500/20 text-yellow-500' },
  approved: { label: 'Approved', color: 'bg-green-500/20 text-green-500' },
  split: { label: 'Split', color: 'bg-blue-500/20 text-blue-500' },
};

export default function DocumentEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { document, isLoading } = useDocument(id || '');
  const { updateDocument, updateStatus, isAdmin } = useDocuments();
  const { comments, addComment } = useDocumentComments(id || '');
  const { posts } = useDocumentPosts(id || '');
  const { sections, updateSection, deleteSection } = useDocumentSections(id || '');
  const { createPost } = usePosts();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [publisherId, setPublisherId] = useState<string | null>(null);
  const [newComment, setNewComment] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [splitModalOpen, setSplitModalOpen] = useState(false);

  useEffect(() => {
    if (document) {
      setTitle(document.title);
      setContent(document.content);
      setPublisherId(document.publisherId);
    }
  }, [document]);

  useEffect(() => {
    if (document) {
      setHasChanges(
        title !== document.title || 
        content !== document.content || 
        publisherId !== document.publisherId
      );
    }
  }, [title, content, publisherId, document]);

  const handleSave = async () => {
    if (!id) return;
    await updateDocument.mutateAsync({ id, title, content, publisherId });
    setHasChanges(false);
  };

  const handleStatusChange = async (status: DocumentStatus) => {
    if (!id) return;
    await updateStatus.mutateAsync({ id, status });
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    await addComment.mutateAsync(newComment);
    setNewComment('');
  };

  const handleSavePosts = async (postsToCreate: Array<{
    content: string;
    publisherName: string;
    publisherRole: string;
    linkedinUrl: string;
    scheduledDate: string;
    documentId: string;
  }>) => {
    try {
      for (const post of postsToCreate) {
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
      
      if (id) {
        await updateStatus.mutateAsync({ id, status: 'split' });
      }
      
      toast.success(`Created ${postsToCreate.length} posts from document`);
      setSplitModalOpen(false);
    } catch (error) {
      console.error('Error creating posts:', error);
      toast.error('Failed to create posts');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center h-96">
          <p className="text-muted-foreground">Loading document...</p>
        </div>
      </div>
    );
  }

  if (!document) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex flex-col items-center justify-center h-96 gap-4">
          <p className="text-muted-foreground">Document not found</p>
          <Button variant="outline" onClick={() => navigate('/documents')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Library
          </Button>
        </div>
      </div>
    );
  }

  const status = statusConfig[document.status];

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="px-8 py-6">
        {/* Top Bar */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/documents')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold">{document.title}</h1>
                <Badge variant="secondary" className={status.color}>
                  {status.label}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Created {format(new Date(document.createdAt), 'MMM d, yyyy')}
                {document.fileName && ` · ${document.fileName}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {hasChanges && (
              <Button onClick={handleSave} disabled={updateDocument.isPending}>
                <Save className="h-4 w-4 mr-2" />
                Save Changes
              </Button>
            )}

            {document.status === 'draft' && isAdmin && (
              <Button 
                variant="outline" 
                onClick={() => handleStatusChange('in_review')}
              >
                <Send className="h-4 w-4 mr-2" />
                Submit for Review
              </Button>
            )}

            {document.status === 'in_review' && isAdmin && (
              <>
                <Button 
                  variant="outline" 
                  onClick={() => handleStatusChange('draft')}
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Request Changes
                </Button>
                <Button onClick={() => handleStatusChange('approved')}>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Approve
                </Button>
              </>
            )}

            {document.status === 'approved' && isAdmin && (
              <Button onClick={() => setSplitModalOpen(true)}>
                <Split className="h-4 w-4 mr-2" />
                Split to Posts
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* Main Editor */}
          <div className="col-span-2 space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Title</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="text-lg font-medium"
              />
            </div>

            {/* Show content textarea only if no sections exist */}
            {sections.length === 0 && (
              <div>
                <label className="text-sm font-medium mb-1.5 block">Content</label>
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="min-h-[300px] resize-none font-mono text-sm"
                  placeholder="Document content..."
                />
              </div>
            )}

            {/* Document Sections for Review */}
            {sections.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-primary" />
                  <h3 className="font-medium">Posts for Review ({sections.length})</h3>
                </div>
                {sections.map((section) => (
                  <DocumentSectionCard
                    key={section.id}
                    section={section}
                    onUpdate={(id, content) => updateSection.mutate({ id, content })}
                    onDelete={(id) => deleteSection.mutate(id)}
                    onApprove={(id) => updateSection.mutate({ id, status: 'approved' })}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Document Info */}
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="font-medium flex items-center gap-2 mb-3">
                <FileText className="h-4 w-4 text-primary" />
                Document Info
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant="secondary" className={status.color}>
                    {status.label}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Created</span>
                  <span>{format(new Date(document.createdAt), 'MMM d, yyyy')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Updated</span>
                  <span>{format(new Date(document.updatedAt), 'MMM d, yyyy')}</span>
                </div>
                {document.approvedAt && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Approved</span>
                    <span>{format(new Date(document.approvedAt), 'MMM d, yyyy')}</span>
                  </div>
                )}
                {document.fileUrl && (
                  <div className="pt-2">
                    <a 
                      href={document.fileUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-primary hover:underline flex items-center gap-1"
                    >
                      <ExternalLink className="h-3 w-3" />
                      View Original File
                    </a>
                  </div>
                )}
              </div>
            </div>

            {/* Assigned Publisher */}
            {isAdmin && (
              <div className="bg-card border border-border rounded-xl p-4">
                <h3 className="font-medium flex items-center gap-2 mb-3">
                  <User className="h-4 w-4 text-primary" />
                  Assigned Publisher
                </h3>
                <DocumentPublisherSelect
                  publisherId={publisherId}
                  onPublisherChange={setPublisherId}
                />
              </div>
            )}

            {/* Edit History */}
            <DocumentEditHistory documentId={id || ''} />

            {/* Linked Posts */}
            <LinkedPostsList posts={posts} />

            {/* Comments */}
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="font-medium flex items-center gap-2 mb-3">
                <MessageSquare className="h-4 w-4 text-primary" />
                Comments ({comments.length})
              </h3>
              
              <div className="space-y-3 max-h-64 overflow-y-auto mb-3">
                {comments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No comments yet</p>
                ) : (
                  comments.map(comment => (
                    <div key={comment.id} className="text-sm">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">{comment.userEmail}</span>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(comment.createdAt), 'MMM d, h:mm a')}
                        </span>
                      </div>
                      <p className="text-muted-foreground">{comment.content}</p>
                    </div>
                  ))
                )}
              </div>

              <Separator className="my-3" />

              <div className="flex gap-2">
                <Input
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Add a comment..."
                  onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
                />
                <Button 
                  size="icon" 
                  onClick={handleAddComment}
                  disabled={!newComment.trim()}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </main>

      <DocumentSplitModal
        open={splitModalOpen}
        onOpenChange={setSplitModalOpen}
        document={document}
        sections={sections}
        onSave={handleSavePosts}
      />
    </div>
  );
}
