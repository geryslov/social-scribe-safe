import { useMemo, useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Post } from '@/types/post';
import { useAuth } from '@/hooks/useAuth';
import { usePosts } from '@/hooks/usePosts';
import { usePublishers } from '@/hooks/usePublishers';
import { useAutoSync } from '@/hooks/useAutoSync';
import { Header } from '@/components/Header';
import { PublisherSidebar } from '@/components/PublisherSidebar';
import { PostRow } from '@/components/PostRow';
import { PostModal } from '@/components/PostModal';
import { LinkedInPostCard } from '@/components/LinkedInPostCard';
import { PublishedPostRow } from '@/components/PublishedPostRow';
import { BulkUploadModal } from '@/components/BulkUploadModal';
import { TrackExternalPostModal } from '@/components/TrackExternalPostModal';
import { DocumentUploadModal } from '@/components/DocumentUploadModal';
import { useDocuments } from '@/hooks/useDocuments';
import { useWorkspace } from '@/hooks/useWorkspace';

import { Button } from '@/components/ui/button';
import { Plus, Inbox, ExternalLink, Loader2, Upload, Users, Eye, Heart, TrendingUp, MessageCircle, Repeat2, LinkIcon, Menu, X, LayoutDashboard } from 'lucide-react';
import { useAnalytics } from '@/hooks/useAnalytics';
import { CountUp } from '@/components/CountUp';
import { Card, CardContent } from '@/components/ui/card';
import { PublisherAvatar } from '@/components/PublisherAvatar';
import { AllReactorsPanel } from '@/components/AllReactorsPanel';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const Posts = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, isAdmin, isLoading: authLoading } = useAuth();
  const { posts, isLoading: postsLoading, createPost, updatePost, deletePost, updateStatus, updateLabels } = usePosts();
  const { publishers: dbPublishers } = usePublishers();

  const handleMediaUpdate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['posts'] });
  }, [queryClient]);

  // Auto-sync LinkedIn analytics on login
  const { isSyncing: isAutoSyncing } = useAutoSync(dbPublishers, user?.id);

  const [selectedPublisher, setSelectedPublisher] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBulkUploadOpen, setIsBulkUploadOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [preselectedPublisher, setPreselectedPublisher] = useState<string | null>(null);
  const viewMode = 'feed' as const;
  const [isDocUploadOpen, setIsDocUploadOpen] = useState(false);
  const [isTrackPostOpen, setIsTrackPostOpen] = useState(false);
  const [showReactorsPanel, setShowReactorsPanel] = useState(false);
  const [reactorsPanelTab, setReactorsPanelTab] = useState<'profiles' | 'comments'>('profiles');
  const { createDocument } = useDocuments();
  const { currentWorkspace } = useWorkspace();
  const canUseAiCreate = user?.email === 'geryslov@gmail.com';
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
  const currentDbPublisher = selectedPublisher ? dbPublishers.find(p => p.name === selectedPublisher) : null;

  // Get analytics stats - filtered by selected publisher or all
  const { stats: analyticsStats, posts: analyticsPosts, isLoading: analyticsLoading } = useAnalytics(selectedPublisher, '30d');

  // Post IDs for reactor panel
  const publishedPostIds = useMemo(() => {
    return publishedPosts.map(p => p.id);
  }, [publishedPosts]);

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
    setIsDocUploadOpen(true);
  };

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
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        {isAutoSyncing && (
          <p className="text-sm text-muted-foreground">Syncing latest analytics...</p>
        )}
      </div>
    );
  }

  const statCards = [
    { label: 'Reach', value: analyticsStats.totalReach, icon: Users, color: 'text-info', bg: 'bg-info/10' },
    { label: 'Impressions', value: analyticsStats.totalImpressions, icon: Eye, color: 'text-primary', bg: 'bg-primary/10' },
    { label: 'Reactions', value: analyticsStats.totalReactions, icon: Heart, color: 'text-destructive', bg: 'bg-destructive/10', onClick: () => { setReactorsPanelTab('profiles'); setShowReactorsPanel(true); }, hint: 'View profiles' },
    { label: 'Comments', value: analyticsStats.totalComments, icon: MessageCircle, color: 'text-primary', bg: 'bg-primary/10', onClick: () => { setReactorsPanelTab('comments'); setShowReactorsPanel(true); }, hint: 'View threads' },
    { label: 'Reshares', value: analyticsStats.totalReshares, icon: Repeat2, color: 'text-muted-foreground', bg: 'bg-muted' },
    { label: 'Engagement', value: analyticsStats.avgEngagementRate, icon: TrendingUp, color: 'text-success', bg: 'bg-success/10', suffix: '%', decimals: 1 },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Mobile sidebar toggle */}
      <div className="lg:hidden px-4 py-2 border-b border-border">
        <Button variant="outline" size="sm" onClick={() => setSidebarOpen(!sidebarOpen)} className="gap-2 rounded-xl bento-card">
          {sidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          Publishers
        </Button>
      </div>

      <div className="flex">
        <div className={cn("lg:block", sidebarOpen ? "block" : "hidden")}>
          <PublisherSidebar
            publishers={publishers}
            selectedPublisher={selectedPublisher}
            onSelectPublisher={setSelectedPublisher}
          />
        </div>

        <main id="main-content" className="flex-1 overflow-y-auto h-[calc(100vh-73px)]">
          <div className="px-6 py-5">

            {/* ============================================= */}
            {/* HERO SECTION: Publisher profile + action bar   */}
            {/* ============================================= */}
            <div className="mb-8">
              {/* Title row */}
              <div className="flex items-start justify-between mb-6">
                <div>
                  {currentPublisher ? (
                    <div className="flex items-center gap-5">
                      <PublisherAvatar name={currentPublisher.name} size="lg" editable={true} className="ring-2 ring-primary/20" />
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-3xl font-display font-extrabold tracking-tight">{currentPublisher.name}</h2>
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
                      <p className="section-heading mb-2">Workspace</p>
                      <h2 className="text-4xl font-display font-extrabold tracking-tight">
                        Content Hub
                      </h2>
                      <p className="text-muted-foreground mt-2">
                        <span className="text-foreground font-semibold">{totalPosts}</span> posts across <span className="text-foreground font-semibold">{publishers.length}</span> publishers
                      </p>
                    </div>
                  )}
                </div>

                {isAdmin && (
                  <div className="flex gap-2">
                    <Button onClick={() => setIsTrackPostOpen(true)} variant="outline" className="gap-2 rounded-xl border-border">
                      <LinkIcon className="h-4 w-4" />
                      Track
                    </Button>
                    <Button onClick={() => setIsBulkUploadOpen(true)} variant="outline" className="gap-2 rounded-xl border-border">
                      <Upload className="h-4 w-4" />
                      Import
                    </Button>
                    <Button onClick={handleNewPost} className="gap-2 bg-primary text-white hover:bg-primary/90 rounded-xl">
                      <Plus className="h-4 w-4" />
                      New Post
                    </Button>
                  </div>
                )}
              </div>

              {/* Bento Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {statCards.map((stat, i) => (
                  <div
                    key={stat.label}
                    className={cn(
                      "bento-card p-4 group cursor-default animate-fade-in",
                      stat.onClick && "cursor-pointer"
                    )}
                    style={{ animationDelay: `${i * 50}ms` }}
                    onClick={stat.onClick}
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <div className={cn("p-1.5 rounded-lg", stat.bg)}>
                        <stat.icon className={cn("h-3.5 w-3.5", stat.color)} />
                      </div>
                      <span className="text-xs text-muted-foreground">{stat.label}</span>
                    </div>
                    <p className="text-2xl font-display font-extrabold tabular-nums tracking-tight">
                      <CountUp end={stat.value} suffix={stat.suffix} decimals={stat.decimals} />
                    </p>
                    {stat.hint && <p className="text-xs text-primary/50 mt-1">{stat.hint}</p>}
                  </div>
                ))}
              </div>
            </div>

            {/* ============================================= */}
            {/* SECTION: Active Posts                          */}
            {/* ============================================= */}
            <div className="space-y-4">
              <p className="section-heading mb-4">
                Active Posts <span className="text-muted-foreground/50 font-normal normal-case tracking-normal">({activePosts.length})</span>
              </p>

              {activePosts.length === 0 ? (
                <div className="text-center py-20 bento-card">
                  <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-primary flex items-center justify-center">
                    <Inbox className="h-8 w-8 text-white" />
                  </div>
                  <h3 className="text-xl font-display font-bold mb-2">No upcoming posts</h3>
                  <p className="text-muted-foreground mb-6 max-w-sm mx-auto text-sm">
                    {selectedPublisher ? `No scheduled posts for ${selectedPublisher}` : 'Start creating content for your thought leaders'}
                  </p>
                  {isAdmin && (
                    <Button onClick={handleNewPost} className="bg-primary text-white hover:bg-primary/90 rounded-xl gap-2">
                      <Plus className="h-4 w-4" /> Create Post
                    </Button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {activePosts.map((post) => {
                    const publisher = dbPublishers.find(p => p.name === post.publisherName);
                    return (
                      <LinkedInPostCard
                        key={post.id}
                        post={post}
                        showAnalytics={false}
                        variant="feed"
                        publisherHeadline={publisher?.headline}
                        publisherCompany={publisher?.company_name}
                        onEdit={handleEdit}
                        onDelete={isAdmin ? handleDelete : undefined}
                        onMediaUpdate={handleMediaUpdate}
                      />
                    );
                  })}
                </div>
              )}
            </div>

            {/* ============================================= */}
            {/* SECTION: Published Posts                       */}
            {/* ============================================= */}
            {publishedPosts.length > 0 && (
              <div className="mt-10">
                {/* Published divider */}
                <div className="flex items-center gap-3 my-8">
                  <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border/50 to-transparent" />
                  <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-success/8 border border-success/15">
                    <div className="h-1.5 w-1.5 rounded-full bg-success" />
                    <span className="text-xs font-semibold text-success">Published ({publishedPosts.length})</span>
                  </div>
                  <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border/50 to-transparent" />
                </div>

                <div className="space-y-1.5">
                  {publishedPosts.map((post, index) => {
                    const publisher = dbPublishers.find(p => p.name === post.publisherName);
                    return (
                      <PublishedPostRow
                        key={post.id}
                        post={post}
                        publisherHeadline={publisher?.headline}
                        publisherCompany={publisher?.company_name}
                        isEven={index % 2 === 0}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      <TrackExternalPostModal
        open={isTrackPostOpen}
        onOpenChange={setIsTrackPostOpen}
      />

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

      <DocumentUploadModal
        open={isDocUploadOpen}
        onOpenChange={setIsDocUploadOpen}
        onSave={handleCreateDocument}
        showAiCreate={canUseAiCreate}
      />
      <AllReactorsPanel
        open={showReactorsPanel}
        onOpenChange={setShowReactorsPanel}
        postIds={publishedPostIds}
        title={selectedPublisher ? `${selectedPublisher}'s Engagers` : 'All Engagers'}
        initialTab={reactorsPanelTab}
        expectedCommentsCount={analyticsStats.totalComments}
      />
    </div>
  );
};

export default Posts;
