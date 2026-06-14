import { cn } from '@/lib/utils';

interface ActivityRingProps {
  fresh: number;
  done: number;
  size?: number;
  thickness?: number;
  children: React.ReactNode;
  className?: string;
}

export function ActivityRing({
  fresh,
  done,
  size = 44,
  thickness = 2,
  children,
  className,
}: ActivityRingProps) {
  const total = fresh + done;
  const hasActivity = total > 0;
  const freshDeg = hasActivity ? (fresh / total) * 360 : 0;
  const doneDeg = hasActivity ? freshDeg + (done / total) * 360 : 0;

  // gold for opportunity, jade for done, hairline for nothing
  const gradient = hasActivity
    ? `conic-gradient(hsl(43 96% 56%) 0deg ${freshDeg}deg, hsl(160 84% 39%) ${freshDeg}deg ${doneDeg}deg, hsl(0 0% 90%) ${doneDeg}deg 360deg)`
    : 'hsl(0 0% 92%)';

  return (
    <div
      className={cn('relative inline-flex items-center justify-center flex-shrink-0', className)}
      style={{ width: size, height: size }}
    >
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: gradient,
          padding: thickness,
        }}
      >
        <div className="h-full w-full rounded-full bg-background" />
      </div>
      <div
        className="relative rounded-full overflow-hidden bg-muted flex items-center justify-center"
        style={{ width: size - thickness * 4, height: size - thickness * 4 }}
      >
        {children}
      </div>
    </div>
  );
}
