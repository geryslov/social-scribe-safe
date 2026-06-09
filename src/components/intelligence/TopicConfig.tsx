import { useState } from 'react';
import { useMonitoringTopics } from '@/hooks/useMonitoringTopics';
import { Publisher } from '@/hooks/usePublishers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Building2, Package, Tags, Pause, Play } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TopicConfigProps {
  publisher: Publisher;
  isAdmin: boolean;
}

const TOPIC_TYPE_META: Record<string, { label: string; icon: typeof Building2; color: string; borderColor: string; placeholder: string }> = {
  company: {
    label: 'Company',
    icon: Building2,
    color: 'bg-blue-50 text-blue-700 border-blue-200',
    borderColor: 'border-l-blue-400',
    placeholder: 'e.g. Acme Inc',
  },
  product: {
    label: 'Product',
    icon: Package,
    color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    borderColor: 'border-l-emerald-400',
    placeholder: 'e.g. Acme CRM',
  },
  category: {
    label: 'Category',
    icon: Tags,
    color: 'bg-violet-50 text-violet-700 border-violet-200',
    borderColor: 'border-l-violet-400',
    placeholder: 'e.g. project management software',
  },
};

export function TopicConfig({ publisher, isAdmin }: TopicConfigProps) {
  const { topics, isLoading, createTopic, updateTopic, deleteTopic } = useMonitoringTopics(publisher.id);
  const [newType, setNewType] = useState('company');
  const [newValue, setNewValue] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleAdd = () => {
    const trimmed = newValue.trim();
    if (!trimmed) return;
    createTopic.mutate(
      { publisher_id: publisher.id, topic_type: newType, topic_value: trimmed },
      { onSuccess: () => setNewValue('') },
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  const handleDelete = (id: string) => {
    if (deletingId === id) {
      deleteTopic.mutate(id);
      setDeletingId(null);
    } else {
      setDeletingId(id);
      setTimeout(() => setDeletingId(null), 3000);
    }
  };

  if (isLoading) {
    return <div className="text-center py-12 text-muted-foreground">Loading topics...</div>;
  }

  // Group topics by type
  const grouped = {
    company: topics.filter((t) => t.topic_type === 'company'),
    product: topics.filter((t) => t.topic_type === 'product'),
    category: topics.filter((t) => t.topic_type === 'category'),
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-display font-semibold text-base mb-1">
          Monitoring Topics for {publisher.name}
        </h3>
        <p className="text-sm text-muted-foreground">
          Add company names, product names, and industry categories to monitor across Reddit, Hacker News, and the web.
        </p>
      </div>

      {/* Add new topic */}
      {isAdmin && (
        <Card className="p-4 border-primary/20">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 block">
            Add Topic
          </label>
          <div className="flex items-end gap-2">
            <div className="w-[140px]">
              <Select value={newType} onValueChange={setNewType}>
                <SelectTrigger className="h-9 focus:ring-primary/30">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="company">
                    <span className="flex items-center gap-1.5">
                      <Building2 className="h-3 w-3 text-blue-600" />Company
                    </span>
                  </SelectItem>
                  <SelectItem value="product">
                    <span className="flex items-center gap-1.5">
                      <Package className="h-3 w-3 text-emerald-600" />Product
                    </span>
                  </SelectItem>
                  <SelectItem value="category">
                    <span className="flex items-center gap-1.5">
                      <Tags className="h-3 w-3 text-violet-600" />Category
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Input
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={TOPIC_TYPE_META[newType]?.placeholder || 'Enter keyword'}
                className="h-9 focus-visible:ring-primary/30"
              />
            </div>
            <Button
              size="sm"
              onClick={handleAdd}
              disabled={!newValue.trim() || createTopic.isPending}
              className="h-9 gap-1.5 font-medium"
            >
              <Plus className="h-3.5 w-3.5" />
              Add
            </Button>
          </div>
        </Card>
      )}

      {/* Topics grouped by type */}
      {topics.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border rounded-lg">
          <Tags className="h-8 w-8 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium text-muted-foreground mb-1">No monitoring topics configured</p>
          <p className="text-xs text-muted-foreground/70">
            Add topics above to start discovering what the internet says about your space.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {(['company', 'product', 'category'] as const).map((type) => {
            const items = grouped[type];
            if (items.length === 0) return null;
            const meta = TOPIC_TYPE_META[type];
            const Icon = meta.icon;

            return (
              <div key={type}>
                <div className="flex items-center gap-2 mb-2">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {meta.label}s
                  </span>
                  <span className="text-[10px] text-muted-foreground/50">({items.length})</span>
                </div>
                <div className="space-y-1">
                  {items.map((topic) => (
                    <Card
                      key={topic.id}
                      className={cn(
                        'px-4 py-2.5 flex items-center justify-between transition-all duration-200 border-l-[3px]',
                        topic.is_active ? meta.borderColor : 'border-l-muted opacity-50',
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-display font-medium text-sm">{topic.topic_value}</span>
                        {!topic.is_active && (
                          <Badge variant="outline" className="text-[10px] border-dashed">Paused</Badge>
                        )}
                      </div>

                      {isAdmin && (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground"
                            onClick={() =>
                              updateTopic.mutate({ id: topic.id, is_active: !topic.is_active })
                            }
                          >
                            {topic.is_active ? (
                              <><Pause className="h-3 w-3" />Pause</>
                            ) : (
                              <><Play className="h-3 w-3" />Resume</>
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className={cn(
                              'h-7 w-7 p-0 transition-colors',
                              deletingId === topic.id
                                ? 'text-destructive bg-destructive/10'
                                : 'text-muted-foreground hover:text-destructive',
                            )}
                            onClick={() => handleDelete(topic.id)}
                            title={deletingId === topic.id ? 'Click again to confirm' : 'Remove'}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
