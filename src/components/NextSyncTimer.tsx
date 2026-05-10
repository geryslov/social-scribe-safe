import { useEffect, useState } from 'react';
import { Clock, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { usePublishers } from '@/hooks/usePublishers';

interface NextSyncTimerProps {
  className?: string;
  compact?: boolean;
}

interface SyncResult {
  publisherId: string;
  publisherName: string;
  success: boolean;
  syncedCount: number;
  slackNotifiedCount?: number;
}

const LAST_SYNC_KEY = 'lastAutoSyncTimestamp';
const LAST_SYNC_RESULTS_KEY = 'lastAutoSyncResults';

function readResults(): { results: SyncResult[]; timestamp: number | null } {
  try {
    const ts = localStorage.getItem(LAST_SYNC_KEY);
    const raw = localStorage.getItem(LAST_SYNC_RESULTS_KEY);
    return {
      results: raw ? JSON.parse(raw) : [],
      timestamp: ts ? parseInt(ts, 10) : null,
    };
  } catch {
    return { results: [], timestamp: null };
  }
}

function formatRelative(ts: number) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(ts).toLocaleString();
}

export function NextSyncTimer({ className, compact = false }: NextSyncTimerProps) {
  const [now, setNow] = useState(() => new Date());
  const [last, setLast] = useState(() => readResults());
  const { publishers } = usePublishers();
  const queryClient = useQueryClient();

  const syncNow = useMutation({
    mutationFn: async () => {
      const connected = publishers.filter((p) => p.linkedin_connected);
      if (connected.length === 0) throw new Error('No LinkedIn-connected publishers');
      const results: SyncResult[] = [];
      for (const p of connected) {
        try {
          const { data, error } = await supabase.functions.invoke('fetch-linkedin-posts', {
            body: { publisherId: p.id },
          });
          if (error) throw error;
          if (data?.error) throw new Error(data.error);
          results.push({ publisherId: p.id, publisherName: p.name, success: true, syncedCount: data?.syncedCount || 0, slackNotifiedCount: data?.slackNotifiedCount || 0 });
        } catch (err) {
          console.error(`Failed to sync ${p.name}:`, err);
          results.push({ publisherId: p.id, publisherName: p.name, success: false, syncedCount: 0, slackNotifiedCount: 0 });
        }
      }
      return results;
    },
    onSuccess: (results) => {
      const successCount = results.filter((r) => r.success).length;
      localStorage.setItem(LAST_SYNC_KEY, Date.now().toString());
      localStorage.setItem(LAST_SYNC_RESULTS_KEY, JSON.stringify(results));
      window.dispatchEvent(new CustomEvent('autoSyncCompleted'));
      queryClient.invalidateQueries({ queryKey: ['app-published-posts'] });
      queryClient.invalidateQueries({ queryKey: ['analytics-posts'] });
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      setLast(readResults());
      toast.success(`Synced ${successCount} of ${results.length} publisher${results.length !== 1 ? 's' : ''}`);
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Sync failed');
    },
  });

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const refresh = () => setLast(readResults());
    window.addEventListener('autoSyncCompleted', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('autoSyncCompleted', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const next = new Date(now);
  next.setHours(next.getHours() + 1, 0, 0, 0);
  const diff = Math.max(0, next.getTime() - now.getTime());
  const m = Math.floor(diff / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');

  const successCount = last.results.filter((r) => r.success).length;
  const totalSynced = last.results.reduce((sum, r) => sum + r.syncedCount, 0);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex items-center gap-1.5 rounded-full border bg-muted/40 px-2.5 py-1 text-xs hover:bg-muted transition-colors',
            className
          )}
          title={`Next Slack sync at ${next.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
        >
          <Clock className="h-3 w-3 text-primary" />
          {!compact && <span className="text-muted-foreground">Next sync</span>}
          <span className="font-mono font-semibold tabular-nums">
            {mm}:{ss}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Last sync</span>
            <span className="text-xs text-muted-foreground">
              {last.timestamp ? formatRelative(last.timestamp) : 'never'}
            </span>
          </div>

          {last.results.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No sync has run yet. The next one is scheduled in {mm}:{ss}.
            </p>
          ) : (
            <>
              <div className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{successCount}</span> of{' '}
                <span className="font-semibold text-foreground">{last.results.length}</span> profile
                {last.results.length !== 1 ? 's' : ''} synced
                {totalSynced > 0 && (
                  <>
                    {' '}· <span className="font-semibold text-foreground">{totalSynced}</span> post
                    {totalSynced !== 1 ? 's' : ''} updated
                  </>
                )}
              </div>
              <div className="max-h-48 overflow-y-auto space-y-1 pt-1 border-t">
                {last.results.map((r) => (
                  <div
                    key={r.publisherId}
                    className="flex items-center justify-between text-xs py-1"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      {r.success ? (
                        <CheckCircle2 className="h-3 w-3 text-green-600 shrink-0" />
                      ) : (
                        <XCircle className="h-3 w-3 text-destructive shrink-0" />
                      )}
                      <span className="truncate">{r.publisherName}</span>
                    </div>
                    <span className="text-muted-foreground tabular-nums">
                      {r.success ? `${r.syncedCount} posts` : 'failed'}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="pt-2 border-t">
            <Button
              size="sm"
              variant="outline"
              className="w-full h-8 text-xs"
              onClick={() => syncNow.mutate()}
              disabled={syncNow.isPending || publishers.filter((p) => p.linkedin_connected).length === 0}
            >
              <RefreshCw className={cn('h-3 w-3', syncNow.isPending && 'animate-spin')} />
              {syncNow.isPending ? 'Syncing…' : 'Sync now'}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
