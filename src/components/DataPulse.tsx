import { cn } from '@/lib/utils';

interface DataPulseProps {
  className?: string;
  label?: string;
}

export function DataPulse({ className, label = 'LIVE' }: DataPulseProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="relative">
        <div className="w-2 h-2 rounded-full bg-info" />
        <div className="absolute inset-0 w-2 h-2 rounded-full bg-info animate-ping" />
      </div>
      <span className="text-xs font-medium tracking-wide text-info uppercase">
        {label}
      </span>
    </div>
  );
}
