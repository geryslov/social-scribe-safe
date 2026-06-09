import { useState } from 'react';
import { Header } from '@/components/Header';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { usePublishers, Publisher } from '@/hooks/usePublishers';
import { Navigate } from 'react-router-dom';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TargetList } from '@/components/engagement/TargetList';
import { MessageCircle } from 'lucide-react';

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
      <main id="main-content" className="max-w-4xl mx-auto px-5 py-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <MessageCircle className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-display font-bold tracking-tight">Engagement</h1>
              <p className="text-sm text-muted-foreground">
                Monitor people, fetch posts, comment as your publisher
              </p>
            </div>
          </div>

          <Select value={selectedPublisherId || ''} onValueChange={setSelectedPublisherId}>
            <SelectTrigger className="w-[200px] focus:ring-primary/30">
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
          <div className="text-center py-20 text-muted-foreground">
            {pubsLoading ? 'Loading publishers...' : 'No publishers in this workspace.'}
          </div>
        ) : (
          <TargetList publisher={selectedPublisher} isAdmin={isAdmin} />
        )}
      </main>
    </div>
  );
}
