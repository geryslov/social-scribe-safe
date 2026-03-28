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
    {
      icon: Users,
      iconBg: 'bg-info/10',
      iconColor: 'text-info',
      value: analyticsStats.totalReach,
      label: 'Total Reach',
      onClick: undefined,
      cursorClass: '',
      delay: 0,
    },
    {
      icon: Eye,
      iconBg: 'bg-primary/10',
      iconColor: 'text-primary',
      value: analyticsStats.totalImpressions,
      label: 'Impressions',
      onClick: undefined,
      cursorClass: '',
      delay: 1,
    },
    {
      icon: Heart,
      iconBg: 'bg-destructive/10',
      iconColor: 'text-destructive',
      value: analyticsStats.totalReactions,
      label: 'Reactions',
      suffix: undefined,
      onClick: () => { setReactorsPanelTab('profiles'); setShowReactorsPanel(true); },
      cursorClass: 'cursor-pointer',
      clickHint: true,
      delay: 2,
    },
    {
      icon: MessageCircle,
      iconBg: 'bg-accent/20',
      iconColor: 'text-accent-foreground',
      value: analyticsStats.totalComments,
      label: 'Comments',
      suffix: undefined,
      onClick: () => { setReactorsPanelTab('comments'); setShowReactorsPanel(true); },
      cursorClass: 'cursor-pointer',
      clickHint: true,
      delay: 3,
    },
    {
      icon: Repeat2,
      iconBg: 'bg-muted',
      iconColor: 'text-muted-foreground',
      value: analyticsStats.totalReshares,
      label: 'Reshares',
      onClick: undefined,
      cursorClass: '',
      delay: 4,
    },
    {
      icon: TrendingUp,
      iconBg: 'bg-success/10',
      iconColor: 'text-success',
      value: analyticsStats.avgEngagementRate,
      label: 'Avg Engagement',
      decimals: 1,
      suffix: '%',
      onClick: undefined,
      cursorClass: '',
      delay: 5,
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="lg:hidden px-4 py-2 border-b border-border">
        <Button variant="outline" size="sm" onClick={() => setSidebarOpen(!sidebarOpen)} className="gap-2 rounded-xl">
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
          <div className="px-8 py-6">
          {/* Background glow */}
          <div className="fixed inset-0 pointer-events-none -z-10" aria-hidden="true">
            <div className="absolute top-1/4 right-1/4 w-96 h-96 rounded-full opacity-[0.03]" style={{ background: 'radial-gradient(circle, hsl(var(--primary)) 0%, transparent 70%)' }} />
          </div>

          {/* Summary Stats - Premium Stat Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
            {statCards.map((card) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.label}
                  className={cn(
                    'bg-card/80 backdrop-blur-sm border border-border/40 rounded-2xl p-5 hover:border-primary/20 transition-all group animate-fade-in',
                    card.cursorClass
                  )}
                  style={{ animationDelay: `${card.delay * 75}ms` }}
                  onClick={card.onClick}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className={cn('p-2.5 rounded-xl', card.iconBg)}>
                      <Icon className={cn('h-5 w-5', card.iconColor)} />
                    </div>
                  </div>
                  <p className="text-3xl font-extrabold tabular-nums data-value">
                    <CountUp end={card.value} decimals={card.decimals} suffix={card.suffix} />
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {card.label}
                    {card.clickHint && <span className="text-primary/60 ml-1">-- view</span>}
                  </p>
                </div>
              );
            })}
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
                    <div className="flex items-center gap-3 mb-1">
                      <div className="p-2 rounded-xl gradient-bg shadow-[0_0_20px_hsl(var(--primary)/0.2)]">
                        <LayoutDashboard className="h-5 w-5 text-white" />
                      </div>
                      <h2 className="text-3xl font-extrabold tracking-tight">
                        <span className="gradient-text">Content Hub</span>
                      </h2>
                    </div>
                    <p className="text-muted-foreground text-sm ml-[52px]">
                      <span className="text-foreground font-medium">{totalPosts}</span> posts from <span className="text-foreground font-medium">{publishers.length}</span> publishers
                    </p>
                  </div>
                )}
              </div>

              {isAdmin && (
                <div className="flex gap-2">
                  <Button
                    onClick={() => setIsTrackPostOpen(true)}
                    size="lg"
                    variant="outline"
                    className="gap-2 rounded-xl border-border/60 hover:border-primary/30"
                  >
                    <LinkIcon className="h-5 w-5" />
                    Track Post
                  </Button>
                  <Button
                    onClick={() => setIsBulkUploadOpen(true)}
                    size="lg"
                    variant="outline"
                    className="gap-2 rounded-xl border-border/60 hover:border-primary/30"
                  >
                    <Upload className="h-5 w-5" />
                    Bulk Upload
                  </Button>
                  <Button onClick={handleNewPost} size="lg" className="gap-2 gradient-bg text-white rounded-xl shadow-[0_4px_20px_hsl(var(--primary)/0.3)] hover:opacity-90 transition-all">
                    <Plus className="h-5 w-5" />
                    New Post
                  </Button>
                </div>
              )}
            </div>

      <TrackExternalPostModal
        open={isTrackPostOpen}
        onOpenChange={setIsTrackPostOpen}
      />

            {/* Active Posts Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <div className="h-5 w-1 rounded-full gradient-bg" />
                  {selectedPublisher ? 'Upcoming Posts' : 'Active Posts'}
                  <span className="ml-1 text-sm font-normal text-muted-foreground">({activePosts.length})</span>
                </h3>

                {/* View Toggle */}
              </div>

              {activePosts.length === 0 ? (
                <div className="text-center py-20 bg-card/50 backdrop-blur-sm border border-dashed border-border/50 rounded-2xl animate-fade-in">
                  <div className="w-20 h-20 mx-auto mb-6 rounded-2xl gradient-bg shadow-[0_0_40px_hsl(var(--primary)/0.2)] flex items-center justify-center">
                    <Inbox className="h-9 w-9 text-white" />
                  </div>
                  <h3 className="text-xl font-bold mb-2">No upcoming posts</h3>
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

            {/* Published Posts Section */}
            {publishedPosts.length > 0 && (
              <div className="mt-10">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
                  <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-success/10 border border-success/20">
                    <div className="h-2 w-2 rounded-full bg-success shadow-[0_0_6px_hsl(var(--success)/0.5)]" />
                    <span className="text-sm font-semibold text-success">Published</span>
                    <span className="text-xs text-success/60">({publishedPosts.length})</span>
                  </div>
                  <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
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
