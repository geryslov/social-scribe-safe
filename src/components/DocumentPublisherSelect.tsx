import { User } from 'lucide-react';
import { usePublishers, Publisher } from '@/hooks/usePublishers';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface DocumentPublisherSelectProps {
  publisherId: string | null;
  onPublisherChange: (publisherId: string | null) => void;
  disabled?: boolean;
}

export function DocumentPublisherSelect({ 
  publisherId, 
  onPublisherChange, 
  disabled = false 
}: DocumentPublisherSelectProps) {
  const { publishers, isLoading } = usePublishers();

  const selectedPublisher = publishers.find(p => p.id === publisherId);

  return (
    <Select
      value={publisherId || 'none'}
      onValueChange={(value) => onPublisherChange(value === 'none' ? null : value)}
      disabled={disabled || isLoading}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Assign to publisher...">
          {selectedPublisher ? (
            <div className="flex items-center gap-2">
              <Avatar className="h-5 w-5">
                <AvatarImage src={selectedPublisher.avatar_url || undefined} />
                <AvatarFallback className="text-[10px]">
                  {selectedPublisher.name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="truncate">{selectedPublisher.name}</span>
            </div>
          ) : (
            <span className="text-muted-foreground">Unassigned</span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <span>Unassigned</span>
          </div>
        </SelectItem>
        {publishers.map((publisher) => (
          <SelectItem key={publisher.id} value={publisher.id}>
            <div className="flex items-center gap-2">
              <Avatar className="h-5 w-5">
                <AvatarImage src={publisher.avatar_url || undefined} />
                <AvatarFallback className="text-[10px]">
                  {publisher.name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col">
                <span>{publisher.name}</span>
                {publisher.role && (
                  <span className="text-xs text-muted-foreground">{publisher.role}</span>
                )}
              </div>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function PublisherBadge({ publisher }: { publisher: Publisher | undefined }) {
  if (!publisher) return null;
  
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-secondary px-2 py-1 rounded">
      <Avatar className="h-4 w-4">
        <AvatarImage src={publisher.avatar_url || undefined} />
        <AvatarFallback className="text-[8px]">
          {publisher.name.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <span className="truncate max-w-20">{publisher.name}</span>
    </div>
  );
}
