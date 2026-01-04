import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { History, ChevronDown, ChevronUp } from 'lucide-react';
import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';

interface EditHistoryProps {
  postId: string;
}

interface EditHistoryEntry {
  id: string;
  post_id: string;
  edited_by: string | null;
  edited_by_email: string;
  previous_content: string;
  new_content: string;
  previous_status: string | null;
  new_status: string | null;
  edited_at: string;
}

interface DiffPart {
  type: 'unchanged' | 'added' | 'removed';
  text: string;
}

function computeDiff(oldText: string, newText: string): DiffPart[] {
  const oldWords = oldText.split(/(\s+)/);
  const newWords = newText.split(/(\s+)/);
  const result: DiffPart[] = [];
  
  // Simple LCS-based diff
  const lcs: number[][] = [];
  for (let i = 0; i <= oldWords.length; i++) {
    lcs[i] = [];
    for (let j = 0; j <= newWords.length; j++) {
      if (i === 0 || j === 0) {
        lcs[i][j] = 0;
      } else if (oldWords[i - 1] === newWords[j - 1]) {
        lcs[i][j] = lcs[i - 1][j - 1] + 1;
      } else {
        lcs[i][j] = Math.max(lcs[i - 1][j], lcs[i][j - 1]);
      }
    }
  }
  
  // Backtrack to find diff
  let i = oldWords.length;
  let j = newWords.length;
  const diffParts: DiffPart[] = [];
  
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldWords[i - 1] === newWords[j - 1]) {
      diffParts.unshift({ type: 'unchanged', text: oldWords[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || lcs[i][j - 1] >= lcs[i - 1][j])) {
      diffParts.unshift({ type: 'added', text: newWords[j - 1] });
      j--;
    } else {
      diffParts.unshift({ type: 'removed', text: oldWords[i - 1] });
      i--;
    }
  }
  
  // Merge consecutive same-type parts
  for (const part of diffParts) {
    if (result.length > 0 && result[result.length - 1].type === part.type) {
      result[result.length - 1].text += part.text;
    } else {
      result.push({ ...part });
    }
  }
  
  return result;
}

function DiffView({ oldText, newText }: { oldText: string; newText: string }) {
  const diff = useMemo(() => computeDiff(oldText, newText), [oldText, newText]);
  
  return (
    <div className="text-foreground/80 whitespace-pre-wrap leading-relaxed">
      {diff.map((part, index) => (
        <span
          key={index}
          className={cn(
            part.type === 'removed' && 'bg-destructive/20 text-destructive line-through',
            part.type === 'added' && 'bg-success/20 text-success'
          )}
        >
          {part.text}
        </span>
      ))}
    </div>
  );
}

function EditHistoryItem({ 
  entry, 
  formatDate 
}: { 
  entry: EditHistoryEntry; 
  formatDate: (date: string) => string;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const contentChanged = entry.previous_content !== entry.new_content;
  const statusChanged = entry.previous_status !== entry.new_status;

  return (
    <div className="text-xs bg-secondary/50 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-medium text-foreground/80">
          {entry.edited_by_email}
        </span>
        <span className="text-muted-foreground">
          {formatDate(entry.edited_at)}
        </span>
      </div>
      
      {statusChanged && (
        <div className="text-muted-foreground">
          Status: <span className="line-through">{entry.previous_status}</span>
          {' → '}
          <span className="text-primary">{entry.new_status}</span>
        </div>
      )}
      
      {contentChanged && (
        <div className="space-y-2">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="text-primary hover:text-primary/80 flex items-center gap-1"
          >
            {showDetails ? (
              <>
                <ChevronUp className="h-3 w-3" />
                Hide changes
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3" />
                View changes
              </>
            )}
          </button>
          
          {showDetails && (
            <div className="bg-secondary/30 border border-border/50 rounded-md p-3 max-h-48 overflow-y-auto">
              <DiffView oldText={entry.previous_content} newText={entry.new_content} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function EditHistory({ postId }: EditHistoryProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const { data: history = [] } = useQuery({
    queryKey: ['edit-history', postId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('post_edit_history')
        .select('*')
        .eq('post_id', postId)
        .order('edited_at', { ascending: false });
      
      if (error) {
        if (error.code === 'PGRST116' || error.message.includes('security')) {
          return [];
        }
        throw error;
      }
      return data as EditHistoryEntry[];
    },
  });

  if (history.length === 0) return null;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="mt-3 border-t border-border/50 pt-3">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <History className="h-3.5 w-3.5" />
        <span>{history.length} edit{history.length !== 1 ? 's' : ''}</span>
        {isExpanded ? (
          <ChevronUp className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        )}
      </button>

      {isExpanded && (
        <div className="mt-2 space-y-3">
          {history.map((entry) => (
            <EditHistoryItem key={entry.id} entry={entry} formatDate={formatDate} />
          ))}
        </div>
      )}
    </div>
  );
}