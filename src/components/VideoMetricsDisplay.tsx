import { Play, Users, Clock, CheckCircle } from 'lucide-react';
import { VideoMetrics } from '@/types/post';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { CyberCard, CyberCardContent, CyberCardHeader, CyberCardTitle } from '@/components/ui/cyber-card';
import { CountUp } from '@/components/CountUp';

interface VideoMetricsCompactProps {
  metrics: VideoMetrics | null | undefined;
  className?: string;
}

export function VideoMetricsCompact({ metrics, className }: VideoMetricsCompactProps) {
  if (!metrics || metrics.views === 0) return null;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className={cn('flex items-center gap-3 text-xs text-muted-foreground', className)}>
      <div className="flex items-center gap-1" title="Video Views">
        <Play className="h-3 w-3 text-purple-400" />
        <span className="font-mono">{metrics.views.toLocaleString()}</span>
      </div>
      {metrics.completionRate !== null && metrics.completionRate > 0 && (
        <div className="flex items-center gap-1" title="Completion Rate">
          <CheckCircle className="h-3 w-3 text-success" />
          <span className="font-mono">{metrics.completionRate.toFixed(0)}%</span>
        </div>
      )}
    </div>
  );
}

interface VideoMetricsCardProps {
  metrics: VideoMetrics | null | undefined;
  className?: string;
}

export function VideoMetricsCard({ metrics, className }: VideoMetricsCardProps) {
  if (!metrics || metrics.views === 0) {
    return (
      <CyberCard className={className}>
        <CyberCardHeader>
          <CyberCardTitle className="flex items-center gap-2">
            <Play className="h-4 w-4 text-purple-400" />
            VIDEO PERFORMANCE
          </CyberCardTitle>
        </CyberCardHeader>
        <CyberCardContent>
          <p className="text-center py-4 text-muted-foreground text-sm">
            No video posts or metrics available
          </p>
        </CyberCardContent>
      </CyberCard>
    );
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const milestones = [
    { label: '25%', value: metrics.milestone25 },
    { label: '50%', value: metrics.milestone50 },
    { label: '75%', value: metrics.milestone75 },
    { label: '100%', value: metrics.milestone100 },
  ];

  const maxMilestone = Math.max(...milestones.map(m => m.value));

  return (
    <CyberCard className={className}>
      <CyberCardHeader>
        <CyberCardTitle className="flex items-center gap-2">
          <Play className="h-4 w-4 text-purple-400" />
          VIDEO PERFORMANCE
        </CyberCardTitle>
      </CyberCardHeader>
      <CyberCardContent className="space-y-4">
        {/* Main Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] text-muted-foreground font-mono mb-1">TOTAL VIEWS</p>
            <p className="text-2xl font-bold font-mono tabular-nums">
              <CountUp end={metrics.views} />
            </p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground font-mono mb-1">UNIQUE VIEWERS</p>
            <p className="text-2xl font-bold font-mono tabular-nums">
              <CountUp end={metrics.uniqueViewers} />
            </p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground font-mono mb-1">AVG WATCH TIME</p>
            <p className="text-lg font-bold font-mono">{formatTime(metrics.watchTimeSeconds)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground font-mono mb-1">COMPLETION RATE</p>
            <p className="text-lg font-bold font-mono text-success">
              {metrics.completionRate?.toFixed(0) || 0}%
            </p>
          </div>
        </div>

        {/* View Milestones */}
        {maxMilestone > 0 && (
          <div>
            <p className="text-[10px] text-muted-foreground font-mono mb-2">VIEW MILESTONES</p>
            <div className="space-y-2">
              {milestones.map(({ label, value }) => {
                const percentage = maxMilestone > 0 ? (value / maxMilestone) * 100 : 0;
                return (
                  <div key={label} className="flex items-center gap-2">
                    <span className="text-xs font-mono w-10 text-muted-foreground">{label}</span>
                    <Progress value={percentage} className="flex-1 h-2" />
                    <span className="text-xs font-mono w-12 text-right tabular-nums">
                      {value.toLocaleString()}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CyberCardContent>
    </CyberCard>
  );
}
