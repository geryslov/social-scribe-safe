import { Calendar, User, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface Publisher {
  id: string;
  name: string;
  role: string | null;
  linkedin_url: string | null;
}

interface SplitPostCardProps {
  index: number;
  content: string;
  publisherId?: string;
  scheduledDate?: string;
  publishers: Publisher[];
  onUpdateContent: (value: string) => void;
  onUpdatePublisher: (value: string) => void;
  onUpdateDate: (value: string) => void;
  onRemove: () => void;
}

export function SplitPostCard({
  index,
  content,
  publisherId,
  scheduledDate,
  publishers,
  onUpdateContent,
  onUpdatePublisher,
  onUpdateDate,
  onRemove,
}: SplitPostCardProps) {
  return (
    <div className="border border-border rounded-lg p-4 space-y-3 bg-card">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">
          Post {index + 1}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-destructive"
          onClick={onRemove}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <Textarea
        value={content}
        onChange={(e) => onUpdateContent(e.target.value)}
        placeholder="Post content..."
        className="min-h-24 resize-none"
      />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
            <User className="h-3 w-3" />
            Publisher
          </label>
          <Select
            value={publisherId || ''}
            onValueChange={onUpdatePublisher}
          >
            <SelectTrigger className={cn(!publisherId && 'text-muted-foreground')}>
              <SelectValue placeholder="Select publisher..." />
            </SelectTrigger>
            <SelectContent>
              {publishers.map(publisher => (
                <SelectItem key={publisher.id} value={publisher.id}>
                  {publisher.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            Scheduled Date
          </label>
          <Input
            type="date"
            value={scheduledDate || ''}
            onChange={(e) => onUpdateDate(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
