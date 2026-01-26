import { Area, AreaChart, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TrendDataPoint } from '@/hooks/useAnalytics';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';

interface PerformanceChartProps {
  data: TrendDataPoint[];
  timeRange: '7d' | '30d' | '90d';
  onTimeRangeChange: (range: '7d' | '30d' | '90d') => void;
  isLoading?: boolean;
}

const timeRanges: { label: string; value: '7d' | '30d' | '90d' }[] = [
  { label: '7D', value: '7d' },
  { label: '30D', value: '30d' },
  { label: '90D', value: '90d' },
];

export function PerformanceChart({ data, timeRange, onTimeRangeChange, isLoading }: PerformanceChartProps) {
  // Format data for display - show every nth label based on range
  const labelInterval = timeRange === '7d' ? 1 : timeRange === '30d' ? 5 : 15;
  
  const formattedData = data.map((point, index) => ({
    ...point,
    displayDate: format(parseISO(point.date), 'MMM d'),
    showLabel: index % labelInterval === 0,
  }));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    
    return (
      <div className="bg-popover border border-border rounded-lg p-3 shadow-xl">
        <p className="font-medium mb-2">{label}</p>
        <div className="space-y-1 text-sm">
          {payload.map((entry: any) => (
            <div key={entry.name} className="flex items-center gap-2">
              <div 
                className="w-2 h-2 rounded-full" 
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-muted-foreground">{entry.name}:</span>
              <span className="font-medium">{entry.value.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Performance Over Time</CardTitle>
          <div className="flex gap-1 bg-muted/50 p-1 rounded-lg">
            {timeRanges.map(range => (
              <Button
                key={range.value}
                variant="ghost"
                size="sm"
                onClick={() => onTimeRangeChange(range.value)}
                className={cn(
                  "h-7 px-3 text-xs font-medium",
                  timeRange === range.value 
                    ? "bg-primary text-primary-foreground hover:bg-primary/90" 
                    : "hover:bg-muted"
                )}
              >
                {range.label}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[280px] w-full">
          {isLoading ? (
            <div className="h-full flex items-center justify-center">
              <div className="animate-pulse text-muted-foreground">Loading chart...</div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={formattedData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="impressionsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="reachGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--info))" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(var(--info))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="reactionsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--success))" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(var(--success))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis 
                  dataKey="displayDate" 
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  interval={labelInterval - 1}
                />
                <YAxis 
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => value.toLocaleString()}
                  width={50}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend 
                  wrapperStyle={{ paddingTop: '10px' }}
                  formatter={(value) => <span className="text-sm text-muted-foreground">{value}</span>}
                />
                <Area
                  type="monotone"
                  dataKey="impressions"
                  name="Impressions"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  fill="url(#impressionsGradient)"
                />
                <Area
                  type="monotone"
                  dataKey="reach"
                  name="Reach"
                  stroke="hsl(var(--info))"
                  strokeWidth={2}
                  fill="url(#reachGradient)"
                />
                <Area
                  type="monotone"
                  dataKey="reactions"
                  name="Reactions"
                  stroke="hsl(var(--success))"
                  strokeWidth={2}
                  fill="url(#reactionsGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
