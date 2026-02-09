import { Area, AreaChart, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, TrendingUp, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { CountUp } from '@/components/CountUp';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { useFollowerHistory } from '@/hooks/useFollowerHistory';
import { CyberCard, CyberCardContent } from '@/components/ui/cyber-card';

const timeRanges: { label: string; value: '7d' | '30d' | '90d' }[] = [
  { label: '7D', value: '7d' },
  { label: '30D', value: '30d' },
  { label: '90D', value: '90d' },
];

interface FollowerGrowthChartProps {
  publisherId: string | undefined;
  timeRange: '7d' | '30d' | '90d';
  onTimeRangeChange: (range: '7d' | '30d' | '90d') => void;
}

export function FollowerGrowthChart({ publisherId, timeRange, onTimeRangeChange }: FollowerGrowthChartProps) {
  const { chartData, stats, isLoading } = useFollowerHistory(publisherId, timeRange);

  const labelInterval = timeRange === '7d' ? 1 : timeRange === '30d' ? 5 : 15;

  const formattedData = chartData.map((point, index) => ({
    ...point,
    displayDate: format(parseISO(point.date), 'MMM d'),
    showLabel: index % labelInterval === 0,
  }));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-popover border border-border rounded-lg p-3 shadow-xl">
        <p className="font-medium mb-1 text-sm">{label}</p>
        <div className="flex items-center gap-2 text-sm">
          <div className="w-2 h-2 rounded-full bg-primary" />
          <span className="text-muted-foreground">Followers:</span>
          <span className="font-bold">{payload[0].value.toLocaleString()}</span>
        </div>
      </div>
    );
  };

  const isPositiveChange = stats.netChange >= 0;

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <CyberCard variant="stat" className="animate-fade-in">
          <CyberCardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Users className="h-4 w-4 text-primary" />
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-2xl font-bold font-mono tabular-nums">
                <CountUp end={stats.currentFollowers} />
              </p>
              <p className="text-[10px] font-mono text-muted-foreground tracking-wider">FOLLOWERS</p>
            </div>
          </CyberCardContent>
        </CyberCard>

        <CyberCard variant="stat" className="animate-fade-in" style={{ animationDelay: '50ms' }}>
          <CyberCardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className={cn("p-2 rounded-lg", isPositiveChange ? "bg-success/10" : "bg-destructive/10")}>
                {isPositiveChange
                  ? <ArrowUpRight className="h-4 w-4 text-success" />
                  : <ArrowDownRight className="h-4 w-4 text-destructive" />
                }
              </div>
            </div>
            <div className="space-y-1">
              <p className={cn("text-2xl font-bold font-mono tabular-nums", isPositiveChange ? "text-success" : "text-destructive")}>
                {isPositiveChange ? '+' : ''}{stats.netChange}
              </p>
              <p className="text-[10px] font-mono text-muted-foreground tracking-wider">NET CHANGE</p>
            </div>
          </CyberCardContent>
        </CyberCard>

        <CyberCard variant="stat" className="animate-fade-in" style={{ animationDelay: '100ms' }}>
          <CyberCardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 rounded-lg bg-info/10">
                <TrendingUp className="h-4 w-4 text-info" />
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-2xl font-bold font-mono tabular-nums">
                {stats.avgDailyGain >= 0 ? '+' : ''}{stats.avgDailyGain}
              </p>
              <p className="text-[10px] font-mono text-muted-foreground tracking-wider">AVG DAILY GAIN</p>
            </div>
          </CyberCardContent>
        </CyberCard>
      </div>

      {/* Chart */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Follower Growth</CardTitle>
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
            ) : formattedData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-muted-foreground font-mono text-sm">
                No follower data yet. Sync to fetch history.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={formattedData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="followerGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
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
                    domain={['dataMin - 5', 'dataMax + 5']}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="followerCount"
                    name="Followers"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#followerGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
