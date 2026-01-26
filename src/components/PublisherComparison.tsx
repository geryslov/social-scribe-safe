import { Bar, BarChart, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, TrendingUp } from 'lucide-react';
import { PublisherRanking } from '@/hooks/useAnalytics';

interface PublisherComparisonProps {
  publishers: PublisherRanking[];
  isLoading?: boolean;
}

export function PublisherComparison({ publishers, isLoading }: PublisherComparisonProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5 text-info" />
            Publisher Comparison
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-10 bg-muted/50 rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (publishers.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5 text-info" />
            Publisher Comparison
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <p>No publisher data available</p>
            <p className="text-sm mt-1">Publish posts to compare performance</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Sort by reach for the chart
  const chartData = [...publishers]
    .sort((a, b) => b.totalReach - a.totalReach)
    .slice(0, 6)
    .map(p => ({
      name: p.name.length > 12 ? p.name.substring(0, 12) + '...' : p.name,
      fullName: p.name,
      reach: p.totalReach,
      engagementRate: p.avgEngagementRate,
    }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const data = payload[0].payload;
    
    return (
      <div className="bg-popover border border-border rounded-lg p-3 shadow-xl">
        <p className="font-medium mb-2">{data.fullName}</p>
        <div className="space-y-1 text-sm">
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Reach:</span>
            <span className="font-medium">{data.reach.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Avg. Engagement:</span>
            <span className="font-medium">{data.engagementRate.toFixed(1)}%</span>
          </div>
        </div>
      </div>
    );
  };

  // Color gradient based on index
  const barColors = [
    'hsl(var(--primary))',
    'hsl(var(--info))',
    'hsl(var(--success))',
    'hsl(262 60% 55%)',
    'hsl(212 80% 55%)',
    'hsl(160 60% 50%)',
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Users className="h-5 w-5 text-info" />
          Publisher Comparison
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[200px] w-full mb-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 10 }}>
              <XAxis 
                type="number" 
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => value.toLocaleString()}
              />
              <YAxis 
                type="category" 
                dataKey="name" 
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                width={90}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.3 }} />
              <Bar dataKey="reach" radius={[0, 4, 4, 0]}>
                {chartData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={barColors[index % barColors.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Engagement Rankings */}
        <div className="border-t border-border pt-4 mt-2">
          <div className="flex items-center gap-2 mb-3 text-sm font-medium text-muted-foreground">
            <TrendingUp className="h-4 w-4" />
            <span>Engagement Rankings</span>
          </div>
          <div className="space-y-2">
            {publishers.slice(0, 5).map((pub, index) => (
              <div key={pub.name} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                    {index + 1}
                  </span>
                  <span className="truncate max-w-[140px]">{pub.name}</span>
                </div>
                <span className="font-medium text-success">{pub.avgEngagementRate.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
