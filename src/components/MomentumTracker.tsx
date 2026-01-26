import { TrendingUp, TrendingDown, Minus, Flame, Zap, Wind, Snowflake } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CyberCard, CyberCardContent, CyberCardHeader, CyberCardTitle } from '@/components/ui/cyber-card';

interface MomentumData {
  impressions: { current: number; previous: number };
  reach: { current: number; previous: number };
  reactions: { current: number; previous: number };
  comments: { current: number; previous: number };
}

interface MomentumTrackerProps {
  data: MomentumData;
  className?: string;
}

function calculateChange(current: number, previous: number): { value: number; trend: 'up' | 'down' | 'neutral' } {
  if (previous === 0) {
    return { value: current > 0 ? 100 : 0, trend: current > 0 ? 'up' : 'neutral' };
  }
  const change = ((current - previous) / previous) * 100;
  return {
    value: Math.abs(change),
    trend: change > 5 ? 'up' : change < -5 ? 'down' : 'neutral',
  };
}

function getVelocityStatus(data: MomentumData): { label: string; icon: typeof Flame; color: string; description: string } {
  const changes = [
    calculateChange(data.impressions.current, data.impressions.previous),
    calculateChange(data.reach.current, data.reach.previous),
    calculateChange(data.reactions.current, data.reactions.previous),
    calculateChange(data.comments.current, data.comments.previous),
  ];

  const avgChange = changes.reduce((sum, c) => sum + (c.trend === 'up' ? c.value : c.trend === 'down' ? -c.value : 0), 0) / changes.length;

  if (avgChange > 30) return { label: 'HIGH', icon: Flame, color: 'text-orange-500', description: 'Peak engagement phase' };
  if (avgChange > 10) return { label: 'GROWING', icon: Zap, color: 'text-success', description: 'Momentum building' };
  if (avgChange > -10) return { label: 'STABLE', icon: Wind, color: 'text-muted-foreground', description: 'Consistent performance' };
  return { label: 'COOLING', icon: Snowflake, color: 'text-info', description: 'Engagement declining' };
}

export function MomentumTracker({ data, className }: MomentumTrackerProps) {
  const velocity = getVelocityStatus(data);
  const VelocityIcon = velocity.icon;

  const metrics = [
    { label: 'Impressions', icon: '📈', ...calculateChange(data.impressions.current, data.impressions.previous) },
    { label: 'Reach', icon: '👤', ...calculateChange(data.reach.current, data.reach.previous) },
    { label: 'Reactions', icon: '❤️', ...calculateChange(data.reactions.current, data.reactions.previous) },
    { label: 'Comments', icon: '💬', ...calculateChange(data.comments.current, data.comments.previous) },
  ];

  return (
    <CyberCard className={className}>
      <CyberCardHeader>
        <CyberCardTitle className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          MOMENTUM TRACKER
        </CyberCardTitle>
      </CyberCardHeader>
      <CyberCardContent className="space-y-4">
        {/* Week over Week Changes */}
        <div>
          <p className="text-[10px] text-muted-foreground font-mono mb-3">THIS WEEK VS LAST WEEK</p>
          <div className="space-y-2">
            {metrics.map(({ label, icon, value, trend }) => {
              const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
              const trendColor = trend === 'up' ? 'text-success' : trend === 'down' ? 'text-destructive' : 'text-muted-foreground';
              const trendSign = trend === 'up' ? '+' : trend === 'down' ? '-' : '';

              return (
                <div key={label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span>{icon}</span>
                    <span className="text-sm">{label}</span>
                  </div>
                  <div className={cn('flex items-center gap-1.5 font-mono text-sm', trendColor)}>
                    <span>{trendSign}{value.toFixed(0)}%</span>
                    <TrendIcon className="h-3.5 w-3.5" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Velocity Indicator */}
        <div className="pt-3 border-t border-border">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Velocity:</span>
            <div className={cn('flex items-center gap-2 font-mono font-bold', velocity.color)}>
              <VelocityIcon className="h-4 w-4" />
              <span>{velocity.label}</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-1">{velocity.description}</p>
        </div>
      </CyberCardContent>
    </CyberCard>
  );
}
