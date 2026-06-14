import { useEffect, useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Clock, RefreshCw, Sparkles, Square } from 'lucide-react';
import { getNextScheduledSync, useEngagementSync } from '@/hooks/useEngagementSync';
import { formatDistanceToNow } from 'date-fns';

function useCountdown(target: Date) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const diff = Math.max(0, target.getTime() - now.getTime());
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1000);
  return { h, m, s };
}

export function SyncStatusBar() {
  const { settings, lastRun, toggle, runNow, stop } = useEngagementSync();
  const enabled = settings?.auto_sync_enabled ?? true;
  const next = getNextScheduledSync();
  const { h, m, s } = useCountdown(next);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-2 border-b bg-muted/30 text-xs">
      {/* Next sync timer */}
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Clock className="h-3.5 w-3.5" />
        <span>Next auto-sync in</span>
        <span className="font-mono font-semibold text-foreground tabular-nums">
          {enabled ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : '—'}
        </span>
      </div>

      {/* Last run summary */}
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5 text-sky-500" />
        {lastRun ? (
          <span>
            Last pull{' '}
            <span className="text-foreground font-medium">
              {formatDistanceToNow(new Date(lastRun.started_at), { addSuffix: true })}
            </span>
            {' · '}
            <span className="text-sky-700 font-semibold">{lastRun.new_posts} new post{lastRun.new_posts === 1 ? '' : 's'}</span>
            {' from '}
            <span className="text-foreground">{lastRun.synced}/{lastRun.total_targets} profiles</span>
            {lastRun.failed > 0 && <span className="text-rose-600"> · {lastRun.failed} failed</span>}
          </span>
        ) : (
          <span>No sync run yet</span>
        )}
      </div>

      <div className="flex-1" />

      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs"
        onClick={() => runNow.mutate()}
        disabled={runNow.isPending}
      >
        <RefreshCw className={`h-3 w-3 mr-1 ${runNow.isPending ? 'animate-spin' : ''}`} />
        {runNow.isPending ? 'Syncing…' : 'Sync now'}
      </Button>

      {runNow.isPending && (
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs border-rose-300 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
          onClick={() => stop.mutate()}
          disabled={stop.isPending}
          title="Stop the running sync"
        >
          <Square className="h-3 w-3 mr-1 fill-current" />
          {stop.isPending ? 'Stopping…' : 'Stop'}
        </Button>
      )}

      <div className="flex items-center gap-2 pl-2 border-l">
        <span className="text-muted-foreground">Auto sync</span>
        <Switch
          checked={enabled}
          onCheckedChange={(v) => toggle.mutate(v)}
          disabled={toggle.isPending}
        />
      </div>
    </div>
  );
}
