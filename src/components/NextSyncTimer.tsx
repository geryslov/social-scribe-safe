import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NextSyncTimerProps {
  className?: string;
  compact?: boolean;
}

export function NextSyncTimer({ className, compact = false }: NextSyncTimerProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const next = new Date(now);
  next.setHours(next.getHours() + 1, 0, 0, 0);
  const diff = Math.max(0, next.getTime() - now.getTime());
  const m = Math.floor(diff / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 rounded-full border bg-muted/40 px-2.5 py-1 text-xs',
        className
      )}
      title={`Next Slack sync at ${next.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
    >
      <Clock className="h-3 w-3 text-primary" />
      {!compact && <span className="text-muted-foreground">Next sync</span>}
      <span className="font-mono font-semibold tabular-nums">
        {mm}:{ss}
      </span>
    </div>
  );
}
