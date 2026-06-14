import { useState } from 'react';
import { Header } from '@/components/Header';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { usePublishers, Publisher } from '@/hooks/usePublishers';
import { Navigate } from 'react-router-dom';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ContactList } from '@/components/engagement/ContactList';
import { PostPanel } from '@/components/engagement/PostPanel';
import { SyncStatusBar } from '@/components/engagement/SyncStatusBar';
import { EngagementTarget, useEngagementTargets } from '@/hooks/useEngagement';
import { MessageCircle } from 'lucide-react';

export default function Engagement() {
  const { user, isAdmin } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const { publishers, isLoading: pubsLoading } = usePublishers();
  const [selectedPublisherId, setSelectedPublisherId] = useState<string | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<EngagementTarget | null>(null);
  const { markSeen } = useEngagementTargets(selectedPublisherId);

  const handleSelectTarget = (target: EngagementTarget) => {
    setSelectedTarget(target);
    // Mark as seen to clear the unseen badge
    markSeen.mutate(target.id);
  };

  if (!user) return <Navigate to="/auth" replace />;

  if (!selectedPublisherId && publishers.length > 0) {
    setSelectedPublisherId(publishers[0].id);
  }

  const selectedPublisher = publishers.find((p) => p.id === selectedPublisherId) || null;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main id="main-content" className="h-[calc(100vh-3.5rem)] flex flex-col">
        {/* Top bar */}
        <div className="flex items-center justify-between px-5 py-3 border-b bg-background">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <MessageCircle className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h1 className="text-base font-display font-bold tracking-tight leading-none">Engagement</h1>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Monitor profiles, fetch posts, engage
              </p>
            </div>
          </div>

          <Select value={selectedPublisherId || ''} onValueChange={(id) => { setSelectedPublisherId(id); setSelectedTarget(null); }}>
            <SelectTrigger className="w-[180px] h-8 text-sm focus:ring-primary/30">
              <SelectValue placeholder="Select publisher" />
            </SelectTrigger>
            <SelectContent>
              {publishers.map((p: Publisher) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <SyncStatusBar />

        {/* Master-detail layout */}
        {!selectedPublisher ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            {pubsLoading ? 'Loading publishers...' : 'No publishers in this workspace.'}
          </div>
        ) : (
          <div className="flex-1 flex overflow-hidden">
            {/* Left: Contact list (fixed 340px) */}
            <div className="w-[340px] flex-shrink-0 border-r flex flex-col bg-muted/20">
              <ContactList
                publisher={selectedPublisher}
                isAdmin={isAdmin}
                selectedTargetId={selectedTarget?.id || null}
                onSelectTarget={handleSelectTarget}
              />
            </div>

            {/* Right: Post detail panel */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <PostPanel
                target={selectedTarget}
                publisher={selectedPublisher}
                isAdmin={isAdmin}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
