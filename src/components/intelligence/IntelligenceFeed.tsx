import { useState } from 'react';
import { useIntelligenceItems, useRunResearch, useMarkItemUsed, IntelligenceItem } from '@/hooks/useIntelligence';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useDocuments } from '@/hooks/useDocuments';
import { Publisher } from '@/hooks/usePublishers';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RefreshCw, ExternalLink, ArrowUp, MessageSquare, Zap, FileText, Loader2, TrendingUp, Eye } from 'lucide-react';
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
  reddit: 'bg-orange-100 text-orange-800 border-orange-200',
  hackernews: 'bg-amber-100 text-amber-800 border-amber-200',
  web: 'bg-sky-100 text-sky-800 border-sky-200',
};

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

/** Engagement tier for visual weight */
function engagementTier(item: IntelligenceItem): 'hot' | 'warm' | 'normal' {
  if (item.engagement_score >= 500) return 'hot';
  if (item.engagement_score >= 100) return 'warm';
  return 'normal';
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
            <SelectTrigger className="w-[150px] h-8 text-sm focus:ring-primary/30">
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
            variant={showUsed ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setShowUsed(!showUsed)}
            className="text-xs gap-1.5 h-8"
          >
            <Eye className="h-3 w-3" />
            {showUsed ? 'Showing used' : 'Show used'}
          </Button>
        </div>

        <div className="flex items-center gap-2">
          {isAdmin && selectedIds.size > 0 && (
            <Button
              size="sm"
              onClick={() => setShowCreateDoc(true)}
              className="gap-1.5 h-8 font-semibold"
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
              className={cn(
                'gap-1.5 h-8 border-primary/30 text-primary hover:bg-primary/10 hover:text-primary font-medium',
                runResearch.isPending && 'animate-pulse',
              )}
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

      {/* Select all bar */}
      {isAdmin && filteredItems.length > 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground px-1">
          <Checkbox
            checked={selectedIds.size === filteredItems.length && filteredItems.length > 0}
            onCheckedChange={selectAll}
            className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
          />
          <span className="text-xs">
            {selectedIds.size > 0
              ? `${selectedIds.size} of ${filteredItems.length} selected`
              : `${filteredItems.length} items`}
          </span>
        </div>
      )}

      {/* Feed items */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="p-4">
              <div className="flex items-start gap-3">
                <Skeleton className="h-4 w-4 rounded mt-1" />
                <div className="flex-1">
                  <Skeleton className="h-3 w-16 mb-2" />
                  <Skeleton className="h-4 w-3/4 mb-1.5" />
                  <Skeleton className="h-3 w-full mb-2" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-lg">
          <Zap className="h-8 w-8 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium text-muted-foreground mb-1">
            {items.length === 0 ? 'No intelligence items yet' : 'No items match your filters'}
          </p>
          <p className="text-xs text-muted-foreground/70">
            {items.length === 0
              ? 'Configure topics in the Topics tab, then run research.'
              : 'Try adjusting your source filter or showing used items.'}
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {filteredItems.map((item) => {
            const tier = engagementTier(item);
            const isSelected = selectedIds.has(item.id);

            return (
              <Card
                key={item.id}
                className={cn(
                  'p-4 transition-all duration-200 hover:shadow-sm group',
                  item.is_used_in_document && 'opacity-50',
                  isSelected && 'ring-1 ring-primary/30 bg-primary/[0.03]',
                  tier === 'hot' && !isSelected && 'border-l-[3px] border-l-primary',
                  tier === 'warm' && !isSelected && 'border-l-[3px] border-l-primary/30',
                )}
              >
                <div className="flex items-start gap-3">
                  {isAdmin && (
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleSelect(item.id)}
                      className="mt-0.5 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                    />
                  )}

                  <div className="flex-1 min-w-0">
                    {/* Source badge + tier + time */}
                    <div className="flex items-center gap-2 mb-1.5">
                      <Badge
                        variant="secondary"
                        className={cn(
                          'text-[10px] font-semibold px-1.5 py-0 border',
                          SOURCE_COLORS[item.source_type],
                        )}
                      >
                        {SOURCE_LABELS[item.source_type] || item.source_type}
                      </Badge>
                      {tier === 'hot' && (
                        <span className="flex items-center gap-0.5 text-[10px] font-semibold text-primary uppercase tracking-wider">
                          <TrendingUp className="h-3 w-3" />
                          Trending
                        </span>
                      )}
                      {item.is_used_in_document && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-dashed">
                          Used
                        </Badge>
                      )}
                      <span className="text-[11px] text-muted-foreground/60 ml-auto">
                        {timeAgo(item.published_at || item.created_at)}
                      </span>
                    </div>

                    {/* Title */}
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-display font-semibold text-[15px] tracking-tight hover:text-primary transition-colors line-clamp-2 flex items-start gap-1.5"
                    >
                      {item.title}
                      <ExternalLink className="h-3 w-3 flex-shrink-0 mt-1 text-muted-foreground/40 group-hover:text-primary/60 transition-colors" />
                    </a>

                    {/* Snippet */}
                    {item.content_snippet && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                        {item.content_snippet}
                      </p>
                    )}

                    {/* Metrics row */}
                    <div className="flex items-center gap-4 mt-2.5">
                      {item.upvotes > 0 && (
                        <span className="flex items-center gap-1 text-xs text-orange-600/80 font-medium">
                          <ArrowUp className="h-3.5 w-3.5" />
                          {item.upvotes.toLocaleString()}
                        </span>
                      )}
                      {item.points > 0 && (
                        <span className="flex items-center gap-1 text-xs text-amber-600/80 font-medium">
                          <Zap className="h-3.5 w-3.5" />
                          {item.points.toLocaleString()}
                        </span>
                      )}
                      {item.comments_count > 0 && (
                        <span className="flex items-center gap-1 text-xs text-sky-600/80 font-medium">
                          <MessageSquare className="h-3.5 w-3.5" />
                          {item.comments_count.toLocaleString()}
                        </span>
                      )}
                      {item.author && (
                        <span className="text-xs text-muted-foreground">by {item.author}</span>
                      )}
                      {(item.source_metadata as Record<string, unknown>)?.subreddit && (
                        <span className="text-xs text-orange-600/60 font-medium">
                          r/{(item.source_metadata as Record<string, unknown>).subreddit as string}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Engagement score */}
                  <div className="flex-shrink-0 text-right">
                    <div className={cn(
                      'text-xs font-mono tabular-nums',
                      tier === 'hot' ? 'text-primary font-semibold' : 'text-muted-foreground/50',
                    )}>
                      {item.engagement_score.toLocaleString()}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
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
