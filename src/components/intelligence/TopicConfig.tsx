import { useState } from 'react';
import { useMonitoringTopics } from '@/hooks/useMonitoringTopics';
import { Publisher } from '@/hooks/usePublishers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Building2, Package, Tags } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TopicConfigProps {
  publisher: Publisher;
  isAdmin: boolean;
}

const TOPIC_TYPE_META: Record<string, { label: string; icon: typeof Building2; color: string; placeholder: string }> = {
  company: { label: 'Company', icon: Building2, color: 'bg-blue-100 text-blue-700', placeholder: 'e.g. Acme Inc' },
  product: { label: 'Product', icon: Package, color: 'bg-green-100 text-green-700', placeholder: 'e.g. Acme CRM' },
  category: { label: 'Category', icon: Tags, color: 'bg-purple-100 text-purple-700', placeholder: 'e.g. project management software' },
};

export function TopicConfig({ publisher, isAdmin }: TopicConfigProps) {
  const { topics, isLoading, createTopic, updateTopic, deleteTopic } = useMonitoringTopics(publisher.id);
  const [newType, setNewType] = useState('company');
  const [newValue, setNewValue] = useState('');

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

  if (isLoading) {
    return <div className="text-center py-12 text-muted-foreground">Loading topics...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold text-sm mb-1">Monitoring Topics for {publisher.name}</h3>
        <p className="text-xs text-muted-foreground">
          Add company names, product names, and industry categories to monitor across Reddit, Hacker News, and the web.
        </p>
      </div>

      {/* Add new topic */}
      {isAdmin && (
        <Card className="p-4">
          <div className="flex items-end gap-2">
            <div className="w-[140px]">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Type</label>
              <Select value={newType} onValueChange={setNewType}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="company">Company</SelectItem>
                  <SelectItem value="product">Product</SelectItem>
                  <SelectItem value="category">Category</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Keyword</label>
              <Input
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={TOPIC_TYPE_META[newType]?.placeholder || 'Enter keyword'}
                className="h-9"
              />
            </div>
            <Button
              size="sm"
              onClick={handleAdd}
              disabled={!newValue.trim() || createTopic.isPending}
              className="h-9 gap-1"
            >
              <Plus className="h-3.5 w-3.5" />
              Add
            </Button>
          </div>
        </Card>
      )}

      {/* Existing topics */}
      {topics.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          No monitoring topics configured yet.
        </div>
      ) : (
        <div className="space-y-2">
          {topics.map((topic) => {
            const meta = TOPIC_TYPE_META[topic.topic_type];
            const Icon = meta?.icon || Tags;
            return (
              <Card
                key={topic.id}
                className={cn('p-3 flex items-center justify-between', !topic.is_active && 'opacity-50')}
              >
                <div className="flex items-center gap-3">
                  <Badge variant="secondary" className={cn('text-[10px] px-1.5 py-0 font-medium', meta?.color)}>
                    <Icon className="h-3 w-3 mr-1" />
                    {meta?.label || topic.topic_type}
                  </Badge>
                  <span className="text-sm font-medium">{topic.topic_value}</span>
                  {!topic.is_active && (
                    <Badge variant="outline" className="text-[10px]">Paused</Badge>
                  )}
                </div>

                {isAdmin && (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() =>
                        updateTopic.mutate({ id: topic.id, is_active: !topic.is_active })
                      }
                    >
                      {topic.is_active ? 'Pause' : 'Resume'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      onClick={() => deleteTopic.mutate(topic.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
