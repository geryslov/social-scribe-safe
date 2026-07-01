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
import { Plus, Inbox, ExternalLink, Loader2, Upload, Users, Eye, Heart, TrendingUp, MessageCircle, Repeat2, LinkIcon, Menu, X, LayoutDashboard, Download } from 'lucide-react';
import { exportWorkspaceReactors } from '@/lib/exportReactors';
import { useAnalytics } from '@/hooks/useAnalytics';
import { CountUp } from '@/components/CountUp';
import { Card, CardContent } from '@/components/ui/card';
import { PublisherAvatar } from '@/components/PublisherAvatar';
import { AllReactorsPanel } from '@/components/AllReactorsPanel';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const MINEOS_CREATOR_LINKEDIN_URLS = [
  'https://www.linkedin.com/in/gilaloni/',
  'https://www.linkedin.com/in/lihi-lotker',
];

const normalizeLinkedInUrl = (url?: string | null) => (url || '').replace(/\/$/, '').toLowerCase();

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
  const mineOsCreatorUrls = MINEOS_CREATOR_LINKEDIN_URLS.map(normalizeLinkedInUrl);
  const isMineOsLinkedInCreator = !!user && currentWorkspace?.slug === 'mineos' && dbPublishers.some(p =>
    p.user_id === user.id && mineOsCreatorUrls.includes(normalizeLinkedInUrl(p.linkedin_url))
  );
  const canCreateContent = isAdmin || isMineOsLinkedInCreator;
  const canUseAiCreate = canCreateContent;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleExportReactors = async () => {
    if (!currentWorkspace) return;
    setIsExporting(true);
    try {
      const { rows } = await exportWorkspaceReactors(currentWorkspace.id, currentWorkspace.slug, { includeCommenters: true });
      toast.success(`Exported ${rows} engager${rows === 1 ? '' : 's'}`);
    } catch (e: any) {
      toast.error(e?.message || 'Export failed');
    } finally {
      setIsExporting(false);
    }
  };

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
      if (!canCreateContent) return;
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
    if (!canCreateContent) return;
    setIsDocUploadOpen(true);
  };

  const handleCreateDocument = async (data: {
    title: string;
    content: string;
    fileName?: string;
    fileUrl?: string;
    publisherIds?: string[];
  }) => {
    const doc = await createDocument.mutateAsync({
      ...data,
      publishers: dbPublishers.map((p) => ({ id: p.id, name: p.name })),
    });
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
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-[#7C3AED]" />
        {isAutoSyncing && (
          <p className="text-sm text-[#667085]">Syncing latest analytics…</p>
        )}
      </div>
    );
  }

  const statCards = [
    { label: 'Reach', value: analyticsStats.totalReach, icon: Users },
    { label: 'Impressions', value: analyticsStats.totalImpressions, icon: Eye },
    { label: 'Reactions', value: analyticsStats.totalReactions, icon: Heart, onClick: () => { setReactorsPanelTab('profiles'); setShowReactorsPanel(true); }, hint: 'View profiles' },
    { label: 'Comments', value: analyticsStats.totalComments, icon: MessageCircle, onClick: () => { setReactorsPanelTab('comments'); setShowReactorsPanel(true); }, hint: 'View threads' },
    { label: 'Reshares', value: analyticsStats.totalReshares, icon: Repeat2 },
    { label: 'Engagement', value: analyticsStats.avgEngagementRate, icon: TrendingUp, suffix: '%', decimals: 1 },
  ];

  return (
    <div>
      {/* Mobile sidebar toggle */}
      <div className="lg:hidden px-6 py-3 border-b border-[#E5E7ED] bg-white">
        <Button variant="outline" size="sm" onClick={() => setSidebarOpen(!sidebarOpen)} className="gap-2 rounded-lg">
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

        <main className="flex-1 min-w-0">
          <div className="px-8 py-6 max-w-[1400px] mx-auto">

            {/* Header row */}
            <div className="mb-6">
              <div className="flex items-start justify-between gap-4 mb-5">
                <div className="min-w-0">
                  {currentPublisher ? (
                    <div className="flex items-center gap-4">
                      <PublisherAvatar name={currentPublisher.name} size="lg" editable={true} className="ring-2 ring-[#7C3AED]/15" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h1 className="text-[22px] font-semibold tracking-tight text-[#171923] truncate">{currentPublisher.name}</h1>
                          {currentPublisher.linkedinUrl && (
                            <a
                              href={currentPublisher.linkedinUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[#7C3AED] hover:text-[#5B21B6] transition-colors"
                              aria-label="Open LinkedIn profile"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          )}
                        </div>
                        {currentPublisher.role && (
                          <p className="text-sm text-[#667085] mt-0.5 truncate">{currentPublisher.role}</p>
                        )}
                        <p className="text-xs text-[#667085] mt-0.5">
                          {totalPosts} post{totalPosts !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wider text-[#667085] mb-1">Workspace</p>
                      <h1 className="text-[22px] font-semibold tracking-tight text-[#171923]">Content Hub</h1>
                      <p className="text-sm text-[#667085] mt-1">
                        <span className="text-[#171923] font-medium">{totalPosts}</span> posts across <span className="text-[#171923] font-medium">{publishers.length}</span> publishers
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex gap-2 flex-shrink-0">
                  {currentWorkspace && (
                    <Button
                      onClick={handleExportReactors}
                      disabled={isExporting}
                      variant="outline"
                      className="gap-2 h-9 rounded-lg border-[#E5E7ED] bg-white text-[#3F4657] hover:bg-[#F7F8FB]"
                      title="Export reactors + commenters as CSV"
                    >
                      {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                      Export engagers
                    </Button>
                  )}
                  {canCreateContent && (
                    <>
                      {isAdmin && (
                        <>
                          <Button onClick={() => setIsTrackPostOpen(true)} variant="outline" className="gap-2 h-9 rounded-lg border-[#E5E7ED] bg-white text-[#3F4657] hover:bg-[#F7F8FB]">
                            <LinkIcon className="h-4 w-4" />
                            Track
                          </Button>
                          <Button onClick={() => setIsBulkUploadOpen(true)} variant="outline" className="gap-2 h-9 rounded-lg border-[#E5E7ED] bg-white text-[#3F4657] hover:bg-[#F7F8FB]">
                            <Upload className="h-4 w-4" />
                            Import
                          </Button>
                        </>
                      )}
                      <Button onClick={handleNewPost} className="gap-2 h-9 rounded-lg bg-[#7C3AED] text-white hover:bg-[#6D28D9]">
                        <Plus className="h-4 w-4" />
                        New Post
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* KPI cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {statCards.map((stat) => (
                  <button
                    type="button"
                    key={stat.label}
                    onClick={stat.onClick}
                    disabled={!stat.onClick}
                    className={cn(
                      "text-left bg-white border border-[#E5E7ED] rounded-[14px] p-4 transition-all",
                      stat.onClick
                        ? "hover:border-[#CFD2DA] hover:shadow-sm cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]/40"
                        : "cursor-default"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-2.5 text-[#667085]">
                      <stat.icon className="h-3.5 w-3.5" />
                      <span className="text-[11px] font-medium uppercase tracking-wider">{stat.label}</span>
                    </div>
                    <p className="text-[24px] font-semibold tabular-nums tracking-tight text-[#171923] leading-none">
                      <CountUp end={stat.value} suffix={stat.suffix} decimals={stat.decimals} />
                    </p>
                    {stat.hint && <p className="text-[11px] text-[#7C3AED] mt-2">{stat.hint} →</p>}
                  </button>
                ))}
              </div>
            </div>

            {/* Active Posts */}
            <div className="space-y-3">
              <div className="flex items-baseline justify-between">
                <h2 className="text-[13px] font-semibold uppercase tracking-wider text-[#3F4657]">
                  Active posts <span className="text-[#667085] font-normal normal-case tracking-normal">({activePosts.length})</span>
                </h2>
              </div>

              {activePosts.length === 0 ? (
                <div className="text-center py-16 bg-white border border-[#E5E7ED] rounded-[14px]">
                  <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-[#F4F0FF] flex items-center justify-center">
                    <Inbox className="h-6 w-6 text-[#7C3AED]" />
                  </div>
                  <h3 className="text-base font-semibold mb-1 text-[#171923]">No upcoming posts</h3>
                  <p className="text-sm text-[#667085] mb-5 max-w-sm mx-auto">
                    {selectedPublisher ? `No scheduled posts for ${selectedPublisher}` : 'Start creating content for your thought leaders'}
                  </p>
                  {canCreateContent && (
                    <Button onClick={handleNewPost} className="h-9 rounded-lg bg-[#7C3AED] text-white hover:bg-[#6D28D9] gap-2">
                      <Plus className="h-4 w-4" /> Create post
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

            {/* Published Posts */}
            {publishedPosts.length > 0 && (
              <div className="mt-10">
                <div className="flex items-center gap-3 mb-4">
                  <h2 className="text-[13px] font-semibold uppercase tracking-wider text-[#3F4657]">
                    Published <span className="text-[#667085] font-normal normal-case tracking-normal">({publishedPosts.length})</span>
                  </h2>
                  <div className="h-px flex-1 bg-[#E5E7ED]" />
                </div>

                <div className="bg-white border border-[#E5E7ED] rounded-[14px] overflow-hidden divide-y divide-[#E5E7ED]">
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
