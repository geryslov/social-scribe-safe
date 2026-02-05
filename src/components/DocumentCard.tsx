import { FileText, MoreVertical, Edit, Trash2, Eye, Split, Clock, CheckCircle, Send } from 'lucide-react';
import { Document, DocumentStatus } from '@/types/document';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Publisher } from '@/hooks/usePublishers';
import { PublisherBadge } from './DocumentPublisherSelect';

interface DocumentCardProps {
  document: Document;
  postCount?: number;
  publisher?: Publisher;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onSplit: (document: Document) => void;
  isAdmin: boolean;
}

const statusConfig: Record<DocumentStatus, { label: string; color: string; icon: typeof Clock }> = {
  draft: { label: 'Draft', color: 'bg-muted text-muted-foreground', icon: Clock },
  in_review: { label: 'In Review', color: 'bg-yellow-500/20 text-yellow-500', icon: Send },
  approved: { label: 'Approved', color: 'bg-green-500/20 text-green-500', icon: CheckCircle },
  split: { label: 'Split', color: 'bg-blue-500/20 text-blue-500', icon: Split },
};

export function DocumentCard({ document, postCount = 0, publisher, onEdit, onDelete, onSplit, isAdmin }: DocumentCardProps) {
  const status = statusConfig[document.status];
  const StatusIcon = status.icon;

  const isInReview = document.status === 'in_review';

  return (
    <div className={cn(
      "group relative bg-card border rounded-xl p-5 hover:shadow-lg transition-all duration-200",
      isInReview 
        ? "border-yellow-500/50 ring-2 ring-yellow-500/20 bg-yellow-500/5" 
        : "border-border hover:border-primary/30"
    )}>
      {/* Status Badge */}
      <div className="absolute top-4 right-4">
        <Badge variant="secondary" className={cn('gap-1.5', status.color)}>
          <StatusIcon className="h-3 w-3" />
          {status.label}
        </Badge>
      </div>

      {/* Icon & Title */}
      <div className="flex items-start gap-3 mb-4 pr-24">
        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <FileText className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-foreground truncate">{document.title}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {format(new Date(document.createdAt), 'MMM d, yyyy')}
          </p>
        </div>
      </div>

      {/* Content Preview */}
      <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
        {document.content.substring(0, 150)}...
      </p>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          {publisher && <PublisherBadge publisher={publisher} />}
          {document.status === 'split' && postCount > 0 && (
            <span className="text-xs text-muted-foreground bg-secondary px-2 py-1 rounded">
              {postCount} post{postCount !== 1 ? 's' : ''}
            </span>
          )}
          {document.fileName && (
            <span className="text-xs text-muted-foreground bg-secondary px-2 py-1 rounded truncate max-w-32">
              {document.fileName}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onEdit(document.id)}
          >
            <Edit className="h-4 w-4" />
          </Button>
          
{document.status === 'approved' && isAdmin && (
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 text-accent border-accent/50 hover:bg-accent/10 hover:border-accent"
              onClick={() => onSplit(document)}
            >
              <Split className="h-4 w-4" />
            </Button>
          )}

          {isAdmin && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEdit(document.id)}>
                  <Eye className="h-4 w-4 mr-2" />
                  View & Edit
                </DropdownMenuItem>
                {document.status === 'approved' && (
                  <DropdownMenuItem onClick={() => onSplit(document)} className="text-accent focus:text-accent">
                    <Split className="h-4 w-4 mr-2" />
                    Split to Posts
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  onClick={() => onDelete(document.id)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </div>
  );
}
