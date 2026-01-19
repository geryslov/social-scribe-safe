import { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Post } from '@/types/post';
import { useAuth } from '@/hooks/useAuth';
import { usePosts } from '@/hooks/usePosts';
import { usePublishers } from '@/hooks/usePublishers';
import { Header } from '@/components/Header';
import { PublisherSidebar } from '@/components/PublisherSidebar';
import { PostRow } from '@/components/PostRow';
import { PostModal } from '@/components/PostModal';
import { BulkUploadModal } from '@/components/BulkUploadModal';
import { Button } from '@/components/ui/button';
import { Plus, Inbox, ExternalLink, Loader2, Upload, Users, FileText, CheckCircle, Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { PublisherAvatar } from '@/components/PublisherAvatar';
import { toast } from 'sonner';

const Index = () => {
  const navigate = useNavigate();
  const { user, isAdmin, isLoading: authLoading } = useAuth();
  const { posts, isLoading: postsLoading, createPost, updatePost, deletePost, updateStatus, updateLabels } = usePosts();
  const { publishers: dbPublishers } = usePublishers();

  const [selectedPublisher, setSelectedPublisher] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBulkUploadOpen, setIsBulkUploadOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [preselectedPublisher, setPreselectedPublisher] = useState<string | null>(null);

  // Redirect to auth if not logged in
  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  // Merge publishers from posts with publishers from database
  const publishers = useMemo(() => {
    const publisherMap = new Map<string, { name: string; role: string; linkedinUrl: string; posts: Post[] }>();
    
    // First add all publishers from database (even those without posts)
    dbPublishers.forEach(pub => {
      publisherMap.set(pub.name, {
        name: pub.name,
        role: pub.role || '',
        linkedinUrl: pub.linkedin_url || '',
        posts: [],
      });
    });
    
    // Then add/update with posts data
    posts.forEach(post => {
      if (!publisherMap.has(post.publisherName)) {
        publisherMap.set(post.publisherName, {
          name: post.publisherName,
          role: post.publisherRole,
          linkedinUrl: post.linkedinUrl,
          posts: [],
        });
      }
      publisherMap.get(post.publisherName)!.posts.push(post);
    });
    
    return Array.from(publisherMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [posts, dbPublishers]);

  const existingPublishers = useMemo(() => {
    return publishers.map(p => ({ name: p.name, role: p.role, linkedinUrl: p.linkedinUrl }));
  }, [publishers]);

  const { activePosts, publishedPosts } = useMemo(() => {
    let postsToFilter: Post[];
    if (selectedPublisher === null) {
      postsToFilter = [...posts];
    } else {
      const publisher = publishers.find(p => p.name === selectedPublisher);
      postsToFilter = publisher?.posts || [];
    }
    
    const active = postsToFilter
      .filter(p => p.status !== 'done')
      .sort((a, b) => new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime());
    
    const published = postsToFilter
      .filter(p => p.status === 'done')
      .sort((a, b) => new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime());
    
    return { activePosts: active, publishedPosts: published };
  }, [posts, selectedPublisher, publishers]);

  const totalPosts = activePosts.length + publishedPosts.length;

  const currentPublisher = selectedPublisher ? publishers.find(p => p.name === selectedPublisher) : null;

  // Global stats (always based on all posts, not filtered)
  const globalStats = useMemo(() => {
    const published = posts.filter(p => p.status === 'done').length;
    const unpublished = posts.filter(p => p.status !== 'done').length;
    return {
      totalPublishers: publishers.length,
      totalPosts: posts.length,
      published,
      unpublished,
    };
  }, [posts, publishers]);

  const handleEdit = (post: Post) => {
    setEditingPost(post);
    setPreselectedPublisher(null);
    setIsModalOpen(true);
  };

  const handleDelete = (postId: string) => {
    if (!isAdmin) return;
    deletePost.mutate(postId);
  };

  const handleStatusChange = (postId: string, status: Post['status'], publisherName?: string) => {
    updateStatus.mutate({ postId, status, publisherName });
  };

  const handleLabelsUpdate = (postId: string, labels: string[]) => {
    updateLabels.mutate({ postId, labels });
  };

  const handleSave = (postData: Omit<Post, 'id'> & { id?: string }) => {
    if (postData.id && editingPost) {
      updatePost.mutate({ post: { ...postData, id: postData.id } as Post, previousPost: editingPost });
    } else {
      if (!isAdmin) return;
      createPost.mutate(postData);
    }
    setEditingPost(null);
    setPreselectedPublisher(null);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingPost(null);
    setPreselectedPublisher(null);
  };

  const handleNewPost = () => {
    if (!isAdmin) return;
    setPreselectedPublisher(selectedPublisher);
    setEditingPost(null);
    setIsModalOpen(true);
  };

  const handleBulkUpload = (posts: { content: string; publisherName: string; scheduledDate: string }[]) => {
    posts.forEach(post => {
      const matchedPublisher = existingPublishers.find(p => p.name === post.publisherName);
      createPost.mutate({
        content: post.content,
        publisherName: post.publisherName,
        publisherRole: matchedPublisher?.role || '',
        linkedinUrl: matchedPublisher?.linkedinUrl || '',
        status: 'scheduled',
        scheduledDate: post.scheduledDate,
      });
    });
    toast.success(`Created ${posts.length} posts`);
  };

  if (authLoading || postsLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <div className="flex">
        <PublisherSidebar
          publishers={publishers}
          selectedPublisher={selectedPublisher}
          onSelectPublisher={setSelectedPublisher}
        />
        
        <main className="flex-1 overflow-y-auto h-[calc(100vh-73px)]">
          <div className="p-8">
          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <Card className="bg-card border-border/60">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-primary/10">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{globalStats.totalPublishers}</p>
                  <p className="text-xs text-muted-foreground">Publishers</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card border-border/60">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-info/10">
                  <FileText className="h-5 w-5 text-info" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{globalStats.totalPosts}</p>
                  <p className="text-xs text-muted-foreground">Total Posts</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card border-border/60">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-success/10">
                  <CheckCircle className="h-5 w-5 text-success" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{globalStats.published}</p>
                  <p className="text-xs text-muted-foreground">Published</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card border-border/60">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-warning/10">
                  <Clock className="h-5 w-5 text-warning" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{globalStats.unpublished}</p>
                  <p className="text-xs text-muted-foreground">Unpublished</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Header Section */}
            <div className="flex items-start justify-between mb-8">
              <div>
                {currentPublisher ? (
                  <div className="flex items-center gap-5">
                    <PublisherAvatar 
                      name={currentPublisher.name} 
                      size="lg" 
                      editable={true}
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-2xl font-bold">{currentPublisher.name}</h2>
                        {currentPublisher.linkedinUrl && (
                          <a
                            href={currentPublisher.linkedinUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:text-primary/80 transition-colors"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                      {currentPublisher.role && (
                        <p className="text-muted-foreground mt-1">{currentPublisher.role}</p>
                      )}
                      <p className="text-sm text-muted-foreground mt-1">
                        {totalPosts} post{totalPosts !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div>
                    <h2 className="text-3xl font-bold tracking-tight">
                      <span className="bg-gradient-to-r from-foreground via-foreground to-muted-foreground/60 bg-clip-text text-transparent">
                        All Posts
                      </span>
                    </h2>
                    <p className="text-muted-foreground mt-2 text-sm">
                      <span className="text-foreground font-medium">{totalPosts}</span> posts from <span className="text-foreground font-medium">{publishers.length}</span> publishers
                    </p>
                  </div>
                )}
              </div>
              
              {isAdmin && (
                <div className="flex gap-2">
                  <Button 
                    onClick={() => setIsBulkUploadOpen(true)} 
                    size="lg" 
                    variant="outline"
                    className="gap-2 rounded-xl"
                  >
                    <Upload className="h-5 w-5" />
                    Bulk Upload
                  </Button>
                  <Button onClick={handleNewPost} size="lg" className="gap-2 gradient-bg glow-primary hover:scale-105 transition-transform rounded-xl">
                    <Plus className="h-5 w-5" />
                    New Post
                  </Button>
                </div>
              )}
            </div>
            
            {/* Active Posts Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-foreground">
                {selectedPublisher ? 'Upcoming Posts' : 'All Active Posts'}
                <span className="ml-2 text-sm font-normal text-muted-foreground">({activePosts.length})</span>
              </h3>
              
              {activePosts.length === 0 ? (
                <div className="text-center py-16 card-elevated animate-fade-in">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl gradient-bg glow-primary flex items-center justify-center">
                    <Inbox className="h-8 w-8 text-primary-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">No upcoming posts</h3>
                  <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
                    {selectedPublisher 
                      ? `No scheduled posts for ${selectedPublisher}`
                      : 'No active posts available'}
                  </p>
                  {isAdmin && (
                    <Button onClick={handleNewPost} size="lg" className="gradient-bg glow-primary rounded-xl">
                      <Plus className="h-5 w-5 mr-2" />
                      Create Post
                    </Button>
                  )}
                </div>
              ) : (
                activePosts.map((post, index) => (
                  <PostRow
                    key={post.id}
                    post={post}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onStatusChange={handleStatusChange}
                    onLabelsUpdate={handleLabelsUpdate}
                    showPublisher={selectedPublisher === null}
                    index={index}
                    isAdmin={isAdmin}
                  />
                ))
              )}
            </div>

            {/* Published Posts Section */}
            {publishedPosts.length > 0 && (
              <div className="space-y-4 mt-10">
                <h3 className="text-lg font-semibold text-foreground">
                  Published
                  <span className="ml-2 text-sm font-normal text-muted-foreground">({publishedPosts.length})</span>
                </h3>
                
                {publishedPosts.map((post, index) => (
                  <PostRow
                    key={post.id}
                    post={post}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onStatusChange={handleStatusChange}
                    onLabelsUpdate={handleLabelsUpdate}
                    showPublisher={selectedPublisher === null}
                    index={index}
                    isAdmin={isAdmin}
                  />
                ))}
              </div>
            )}
          </div>
        </main>
      </div>

      <PostModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSave={handleSave}
        post={editingPost}
        existingPublishers={existingPublishers}
        preselectedPublisher={preselectedPublisher}
      />

      <BulkUploadModal
        isOpen={isBulkUploadOpen}
        onClose={() => setIsBulkUploadOpen(false)}
        onSave={handleBulkUpload}
        existingPublishers={existingPublishers}
      />
    </div>
  );
};

export default Index;
