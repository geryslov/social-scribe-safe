import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Save, Send, CheckCircle, RotateCcw, Split,
  FileText, Clock, MessageSquare, ExternalLink, Layers, User, Users, Loader2
} from 'lucide-react';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { DocumentSplitModal } from '@/components/DocumentSplitModal';
import { LinkedPostsList } from '@/components/LinkedPostCard';
import { DocumentEditHistory } from '@/components/DocumentEditHistory';
import { DocumentSectionCard } from '@/components/DocumentSectionCard';
import { DocumentPublisherSelect } from '@/components/DocumentPublisherSelect';
import { useDocument, useDocuments, useDocumentComments, useDocumentPosts, useDocumentSections } from '@/hooks/useDocuments';
import { useWorkspace } from '@/hooks/useWorkspace';
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
  const { currentWorkspace } = useWorkspace();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [publisherId, setPublisherId] = useState<string | null>(null);
  const [newComment, setNewComment] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [splitModalOpen, setSplitModalOpen] = useState(false);
  const [selectedSections, setSelectedSections] = useState<Set<string>>(new Set());

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
        <div className="flex flex-col items-center justify-center h-96 gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading document...</p>
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
          <Button variant="outline" onClick={() => navigate('/documents')} className="rounded-xl h-8 text-sm">
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

      <main id="main-content" className="px-8 py-6">
        {/* Background glow */}
        <div className="fixed inset-0 pointer-events-none -z-10" aria-hidden="true">
          <div className="absolute top-1/4 left-1/2 w-[500px] h-[500px] rounded-full opacity-[0.03]" style={{ background: 'radial-gradient(circle, hsl(var(--warm)) 0%, transparent 70%)' }} />
        </div>

        {/* Top Bar */}
        <div className="flex items-center justify-between mb-6 pb-5 border-b border-border/30">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/documents')} className="h-8 w-8 rounded-lg hover:bg-foreground/5 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-display font-bold">{document.title}</h1>
                <Badge variant="secondary" className={status.color}>{status.label}</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Created {format(new Date(document.createdAt), 'MMM d, yyyy')}
                {document.fileName && ` · ${document.fileName}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {hasChanges && (
              <Button onClick={handleSave} disabled={updateDocument.isPending} className="btn-warm rounded-xl gap-1.5 h-8 text-sm">
                <Save className="h-3.5 w-3.5" /> Save
              </Button>
            )}

            {document.status === 'draft' && isAdmin && (
              <Button
                variant="outline"
                className="rounded-xl h-8 text-sm"
                onClick={() => handleStatusChange('in_review')}
              >
                <Send className="h-3.5 w-3.5 mr-1.5" />
                Submit for Review
              </Button>
            )}

            {document.status === 'in_review' && isAdmin && (
              <>
                <Button
                  variant="outline"
                  className="rounded-xl h-8 text-sm"
                  onClick={() => handleStatusChange('draft')}
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                  Request Changes
                </Button>
                <Button onClick={() => handleStatusChange('approved')} className="btn-warm rounded-xl h-8 text-sm gap-1.5">
                  <CheckCircle className="h-3.5 w-3.5" /> Approve
                </Button>
              </>
            )}

            {document.status === 'approved' && isAdmin && (
              <Button onClick={() => setSplitModalOpen(true)} className="btn-warm rounded-xl h-8 text-sm gap-1.5">
                <Split className="h-3.5 w-3.5" /> Split to Posts
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
          {/* Main Editor */}
          <div className="space-y-4">
            {/* Editor card */}
            <div className="bento-card p-6">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Title</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="text-xl font-display font-bold border-none bg-transparent px-0 focus-visible:ring-0 placeholder:text-muted-foreground/30"
                placeholder="Document title..."
              />

              {/* Show content textarea only if no sections exist */}
              {sections.length === 0 && (
                <>
                  <div className="h-px bg-border/30 my-4" />
                  <Textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    className="min-h-[400px] resize-none border-none bg-transparent px-0 focus-visible:ring-0 text-sm leading-relaxed"
                    placeholder="Start writing..."
                  />
                </>
              )}
            </div>

            {/* Document Sections for Review */}
            {sections.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="section-heading mb-0">Posts for Review <span className="normal-case tracking-normal font-normal text-muted-foreground/50">({sections.length})</span></p>

                  {/* Select All Checkbox */}
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="select-all"
                      checked={selectedSections.size === sections.length && sections.length > 0}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedSections(new Set(sections.map(s => s.id)));
                        } else {
                          setSelectedSections(new Set());
                        }
                      }}
                    />
                    <label htmlFor="select-all" className="text-sm text-muted-foreground cursor-pointer">
                      Select all
                    </label>
                  </div>
                </div>

                {/* Bulk Actions Bar */}
                {selectedSections.size > 0 && (
                  <div className="flex items-center gap-3 p-3 bg-primary/10 border border-primary/20 rounded-lg">
                    <Users className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">
                      {selectedSections.size} post{selectedSections.size !== 1 ? 's' : ''} selected
                    </span>
                    <div className="flex-1 max-w-64">
                      <DocumentPublisherSelect
                        publisherId={null}
                        disabled={updateSection.isPending}
                        onPublisherChange={async (newPublisherId) => {
                          const sectionIds = Array.from(selectedSections);

                          try {
                            await Promise.all(
                              sectionIds.map((sectionId) =>
                                updateSection.mutateAsync({ id: sectionId, publisherId: newPublisherId })
                              )
                            );

                            setSelectedSections(new Set());
                            toast.success(
                              `Assigned publisher to ${sectionIds.length} post${sectionIds.length !== 1 ? 's' : ''}`
                            );
                          } catch (error) {
                            console.error('Failed to assign publisher to selected posts:', error);
                            toast.error(
                              error instanceof Error ? error.message : 'Failed to assign publisher to selected posts'
                            );
                          }
                        }}
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedSections(new Set())}
                    >
                      Clear
                    </Button>
                  </div>
                )}

                {sections.map((section) => (
                  <div key={section.id} className="flex gap-3">
                    <div className="pt-4">
                      <Checkbox
                        checked={selectedSections.has(section.id)}
                        onCheckedChange={(checked) => {
                          const newSelected = new Set(selectedSections);
                          if (checked) {
                            newSelected.add(section.id);
                          } else {
                            newSelected.delete(section.id);
                          }
                          setSelectedSections(newSelected);
                        }}
                      />
                    </div>
                    <div className="flex-1">
                    <DocumentSectionCard
                        section={section}
                        onUpdate={(id, content) => updateSection.mutate({ id, content })}
                        onDelete={(id) => deleteSection.mutate(id)}
                        onApprove={(id) => updateSection.mutate({ id, status: 'approved' })}
                        onPublisherChange={(id, publisherId) => updateSection.mutate({ id, publisherId })}
                        workspaceSystemPrompt={currentWorkspace?.systemPrompt || undefined}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Document Info */}
            <div className="bento-card p-4">
              <p className="section-heading mb-3">Document Info</p>
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
              <div className="bento-card p-4">
                <p className="section-heading mb-3">Assigned Publisher</p>
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
            <div className="bento-card p-4">
              <p className="section-heading mb-3">Comments <span className="normal-case tracking-normal font-normal text-muted-foreground/50">({comments.length})</span></p>

              <div className="space-y-3 max-h-64 overflow-y-auto mb-3">
                {comments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No comments yet</p>
                ) : (
                  comments.map(comment => (
                    <div key={comment.id} className="text-sm pl-3 border-l-2 border-warm/20">
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
                  className="rounded-xl bg-foreground/[0.03] border-border/40"
                />
                <Button
                  size="icon"
                  onClick={handleAddComment}
                  disabled={!newComment.trim()}
                  className="btn-warm rounded-lg h-9 w-9"
                >
                  <Send className="h-3.5 w-3.5" />
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
