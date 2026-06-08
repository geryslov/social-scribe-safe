import { useState } from 'react';
import { useIntelligenceItems, useRunResearch, useMarkItemUsed, IntelligenceItem } from '@/hooks/useIntelligence';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useDocuments } from '@/hooks/useDocuments';
import { Publisher } from '@/hooks/usePublishers';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RefreshCw, ExternalLink, ArrowUp, MessageSquare, Zap, FileText, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CreateDocumentFromFeed } from './CreateDocumentFromFeed';

interface IntelligenceFeedProps {
  publisher: Publisher;
  isAdmin: boolean;
}

const SOURCE_LABELS: Record<string, string> = {
  reddit: 'Reddit',
  hackernews: 'Hacker News',
  web: 'Web',
};

const SOURCE_COLORS: Record<string, string> = {
  reddit: 'bg-orange-100 text-orange-700',
  hackernews: 'bg-amber-100 text-amber-700',
  web: 'bg-blue-100 text-blue-700',
};

function formatEngagement(item: IntelligenceItem): string {
  const parts: string[] = [];
  if (item.upvotes > 0) parts.push(`${item.upvotes.toLocaleString()} upvotes`);
  if (item.points > 0) parts.push(`${item.points.toLocaleString()} points`);
  if (item.comments_count > 0) parts.push(`${item.comments_count.toLocaleString()} comments`);
  return parts.join(' · ') || 'No engagement data';
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export function IntelligenceFeed({ publisher, isAdmin }: IntelligenceFeedProps) {
  const { currentWorkspace } = useWorkspace();
  const { items, isLoading } = useIntelligenceItems(publisher.id);
  const runResearch = useRunResearch();
  const { createDocument } = useDocuments();
  const markUsed = useMarkItemUsed();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [showUsed, setShowUsed] = useState(false);
  const [showCreateDoc, setShowCreateDoc] = useState(false);

  const filteredItems = items.filter((item) => {
    if (sourceFilter !== 'all' && item.source_type !== sourceFilter) return false;
    if (!showUsed && item.is_used_in_document) return false;
    return true;
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === filteredItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredItems.map((i) => i.id)));
    }
  };

  const selectedItems = items.filter((i) => selectedIds.has(i.id));

  const handleRunResearch = () => {
    if (!currentWorkspace) return;
    runResearch.mutate({ workspace_id: currentWorkspace.id, publisher_id: publisher.id });
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="w-[150px] h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              <SelectItem value="reddit">Reddit</SelectItem>
              <SelectItem value="hackernews">Hacker News</SelectItem>
              <SelectItem value="web">Web</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowUsed(!showUsed)}
            className="text-xs"
          >
            {showUsed ? 'Hide used' : 'Show used'}
          </Button>
        </div>

        <div className="flex items-center gap-2">
          {isAdmin && selectedIds.size > 0 && (
            <Button
              size="sm"
              onClick={() => setShowCreateDoc(true)}
              className="gap-1.5"
            >
              <FileText className="h-3.5 w-3.5" />
              Create Document ({selectedIds.size})
            </Button>
          )}

          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRunResearch}
              disabled={runResearch.isPending}
              className="gap-1.5"
            >
              {runResearch.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              {runResearch.isPending ? 'Researching...' : 'Run Research'}
            </Button>
          )}
        </div>
      </div>

      {/* Select all */}
      {isAdmin && filteredItems.length > 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox
            checked={selectedIds.size === filteredItems.length && filteredItems.length > 0}
            onCheckedChange={selectAll}
          />
          <span>
            {selectedIds.size > 0
              ? `${selectedIds.size} of ${filteredItems.length} selected`
              : `${filteredItems.length} items`}
          </span>
        </div>
      )}

      {/* Feed items */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading feed...</div>
      ) : filteredItems.length === 0 ? (
        <div className="text-center py-12">
          <Zap className="h-8 w-8 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground">
            {items.length === 0
              ? 'No intelligence items yet. Configure topics and run research.'
              : 'No items match your filters.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredItems.map((item) => (
            <Card
              key={item.id}
              className={cn(
                'p-4 transition-colors',
                item.is_used_in_document && 'opacity-60',
                selectedIds.has(item.id) && 'ring-2 ring-primary/30 bg-primary/5',
              )}
            >
              <div className="flex items-start gap-3">
                {isAdmin && (
                  <Checkbox
                    checked={selectedIds.has(item.id)}
                    onCheckedChange={() => toggleSelect(item.id)}
                    className="mt-1"
                  />
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="secondary" className={cn('text-[10px] font-medium px-1.5 py-0', SOURCE_COLORS[item.source_type])}>
                      {SOURCE_LABELS[item.source_type] || item.source_type}
                    </Badge>
                    {item.is_used_in_document && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        Used
                      </Badge>
                    )}
                    <span className="text-[11px] text-muted-foreground">
                      {timeAgo(item.published_at || item.created_at)}
                    </span>
                  </div>

                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-sm hover:text-primary transition-colors line-clamp-2 flex items-start gap-1"
                  >
                    {item.title}
                    <ExternalLink className="h-3 w-3 flex-shrink-0 mt-0.5 text-muted-foreground" />
                  </a>

                  {item.content_snippet && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {item.content_snippet}
                    </p>
                  )}

                  <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                    {item.upvotes > 0 && (
                      <span className="flex items-center gap-0.5">
                        <ArrowUp className="h-3 w-3" />
                        {item.upvotes.toLocaleString()}
                      </span>
                    )}
                    {item.points > 0 && (
                      <span className="flex items-center gap-0.5">
                        <Zap className="h-3 w-3" />
                        {item.points.toLocaleString()}
                      </span>
                    )}
                    {item.comments_count > 0 && (
                      <span className="flex items-center gap-0.5">
                        <MessageSquare className="h-3 w-3" />
                        {item.comments_count.toLocaleString()}
                      </span>
                    )}
                    {item.author && <span>by {item.author}</span>}
                    {(item.source_metadata as Record<string, unknown>)?.subreddit && (
                      <span>r/{(item.source_metadata as Record<string, unknown>).subreddit as string}</span>
                    )}
                  </div>
                </div>

                <div className="text-right flex-shrink-0">
                  <div className="text-xs font-mono text-muted-foreground">
                    {item.engagement_score.toLocaleString()}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create Document modal */}
      {showCreateDoc && (
        <CreateDocumentFromFeed
          items={selectedItems}
          publisher={publisher}
          onClose={() => setShowCreateDoc(false)}
          onCreated={(docId) => {
            markUsed.mutate({ itemIds: Array.from(selectedIds), documentId: docId });
            setSelectedIds(new Set());
            setShowCreateDoc(false);
          }}
        />
      )}
    </div>
  );
}
