import { useState } from 'react';
import { Header } from '@/components/Header';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { usePublishers, Publisher } from '@/hooks/usePublishers';
import { Navigate } from 'react-router-dom';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TargetList } from '@/components/engagement/TargetList';

export default function Engagement() {
  const { user, isAdmin } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const { publishers, isLoading: pubsLoading } = usePublishers();
  const [selectedPublisherId, setSelectedPublisherId] = useState<string | null>(null);

  if (!user) return <Navigate to="/auth" replace />;

  if (!selectedPublisherId && publishers.length > 0) {
    setSelectedPublisherId(publishers[0].id);
  }

  const selectedPublisher = publishers.find((p) => p.id === selectedPublisherId) || null;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main id="main-content" className="max-w-7xl mx-auto px-5 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Engagement</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Monitor people, see their posts, comment as your publisher
            </p>
          </div>

          <Select value={selectedPublisherId || ''} onValueChange={setSelectedPublisherId}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Select publisher" />
            </SelectTrigger>
            <SelectContent>
              {publishers.map((p: Publisher) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!selectedPublisher ? (
          <div className="text-center py-16 text-muted-foreground">
            {pubsLoading ? 'Loading publishers...' : 'No publishers in this workspace.'}
          </div>
        ) : (
          <TargetList publisher={selectedPublisher} isAdmin={isAdmin} />
        )}
      </main>
    </div>
  );
}
