import { useState } from 'react';
import { Header } from '@/components/Header';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { usePublishers, Publisher } from '@/hooks/usePublishers';
import { Navigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { IntelligenceFeed } from '@/components/intelligence/IntelligenceFeed';
import { TopicConfig } from '@/components/intelligence/TopicConfig';
import { ResearchSettingsPanel } from '@/components/intelligence/ResearchSettingsPanel';
import { Zap, Radar, Settings } from 'lucide-react';

export default function Intelligence() {
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
      <main id="main-content" className="max-w-5xl mx-auto px-5 py-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Zap className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-display font-bold tracking-tight">Intelligence</h1>
              <p className="text-sm text-muted-foreground">
                Research feed powered by community signal
              </p>
            </div>
          </div>

          <Select
            value={selectedPublisherId || ''}
            onValueChange={setSelectedPublisherId}
          >
            <SelectTrigger className="w-[200px] focus:ring-primary/30">
              <SelectValue placeholder="Select publisher" />
            </SelectTrigger>
            <SelectContent>
              {publishers.map((p: Publisher) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!selectedPublisher ? (
          <div className="text-center py-20 text-muted-foreground">
            {pubsLoading ? 'Loading publishers...' : 'No publishers in this workspace. Add a publisher first.'}
          </div>
        ) : (
          <Tabs defaultValue="feed" className="space-y-6">
            <TabsList className="bg-muted/50">
              <TabsTrigger value="feed" className="gap-1.5 data-[state=active]:text-primary">
                <Zap className="h-3.5 w-3.5" />
                Feed
              </TabsTrigger>
              <TabsTrigger value="topics" className="gap-1.5 data-[state=active]:text-primary">
                <Radar className="h-3.5 w-3.5" />
                Topics
              </TabsTrigger>
              {isAdmin && (
                <TabsTrigger value="settings" className="gap-1.5 data-[state=active]:text-primary">
                  <Settings className="h-3.5 w-3.5" />
                  Settings
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="feed">
              <IntelligenceFeed
                publisher={selectedPublisher}
                isAdmin={isAdmin}
              />
            </TabsContent>

            <TabsContent value="topics">
              <TopicConfig
                publisher={selectedPublisher}
                isAdmin={isAdmin}
              />
            </TabsContent>

            {isAdmin && (
              <TabsContent value="settings">
                <ResearchSettingsPanel publisher={selectedPublisher} />
              </TabsContent>
            )}
          </Tabs>
        )}
      </main>
    </div>
  );
}
