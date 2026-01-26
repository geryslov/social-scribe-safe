import { LucideIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';

interface StatCardWithTrendProps {
  title: string;
  value: number | string;
  icon: LucideIcon;
  trend?: number; // percentage change
  sparklineData?: { value: number }[];
  colorClass?: string;
  format?: 'number' | 'percentage';
}

export function StatCardWithTrend({
  title,
  value,
  icon: Icon,
  trend,
  sparklineData,
  colorClass = 'bg-primary/10 text-primary',
  format = 'number',
}: StatCardWithTrendProps) {
  const formattedValue = format === 'percentage' 
    ? `${typeof value === 'number' ? value.toFixed(1) : value}%`
    : typeof value === 'number' 
      ? value.toLocaleString() 
      : value;

  const TrendIcon = trend === undefined || trend === 0 
    ? Minus 
    : trend > 0 
      ? TrendingUp 
      : TrendingDown;

  const trendColor = trend === undefined || trend === 0 
    ? 'text-muted-foreground' 
    : trend > 0 
      ? 'text-success' 
      : 'text-destructive';

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className={cn("p-2.5 rounded-xl", colorClass)}>
            <Icon className="h-5 w-5" />
          </div>
          {trend !== undefined && (
            <div className={cn("flex items-center gap-1 text-xs font-medium", trendColor)}>
              <TrendIcon className="h-3.5 w-3.5" />
              <span>{Math.abs(trend).toFixed(1)}%</span>
            </div>
          )}
        </div>
        
        <div className="space-y-1">
          <p className="text-3xl font-bold tracking-tight">{formattedValue}</p>
          <p className="text-sm text-muted-foreground">{title}</p>
        </div>

        {sparklineData && sparklineData.length > 0 && (
          <div className="h-10 mt-3 -mx-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparklineData}>
                <defs>
                  <linearGradient id={`gradient-${title}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="hsl(var(--primary))"
                  strokeWidth={1.5}
                  fill={`url(#gradient-${title})`}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
