import { useState } from 'react';
import { Check, X, Edit2, Trash2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { DocumentSection } from '@/hooks/useDocuments';

interface DocumentSectionCardProps {
  section: DocumentSection;
  onUpdate: (id: string, content: string) => void;
  onDelete: (id: string) => void;
  onApprove: (id: string) => void;
}

export function DocumentSectionCard({ 
  section, 
  onUpdate, 
  onDelete,
  onApprove 
}: DocumentSectionCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(section.content);

  const handleSave = () => {
    onUpdate(section.id, editContent);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditContent(section.content);
    setIsEditing(false);
  };

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-500/20 text-yellow-600',
    approved: 'bg-green-500/20 text-green-600',
    rejected: 'bg-red-500/20 text-red-600',
  };

  return (
    <div className="border border-border rounded-lg p-4 bg-card space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            Post {section.sectionNumber}
          </span>
          <Badge variant="secondary" className={statusColors[section.status] || ''}>
            {section.status}
          </Badge>
        </div>
        
        <div className="flex items-center gap-1">
          {!isEditing ? (
            <>
              {section.status === 'pending' && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-green-600"
                  onClick={() => onApprove(section.id)}
                >
                  <Check className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setIsEditing(true)}
              >
                <Edit2 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive"
                onClick={() => onDelete(section.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-green-600"
                onClick={handleSave}
              >
                <Save className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleCancel}
              >
                <X className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      {isEditing ? (
        <Textarea
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          className="min-h-32 resize-none"
        />
      ) : (
        <p className="text-sm whitespace-pre-wrap">{section.content}</p>
      )}
    </div>
  );
}
