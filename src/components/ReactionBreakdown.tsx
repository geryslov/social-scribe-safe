import { ThumbsUp, PartyPopper, Heart, Lightbulb, HelpCircle, HandshakeIcon } from 'lucide-react';
import { ReactionBreakdown as ReactionBreakdownType } from '@/types/post';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Progress } from '@/components/ui/progress';

interface ReactionBreakdownProps {
  breakdown: ReactionBreakdownType | null | undefined;
  totalReactions: number;
  className?: string;
}

const reactionConfig = [
  { key: 'like' as const, icon: ThumbsUp, label: 'Like', color: 'text-blue-500' },
  { key: 'celebrate' as const, icon: PartyPopper, label: 'Celebrate', color: 'text-orange-500' },
  { key: 'support' as const, icon: HandshakeIcon, label: 'Support', color: 'text-green-500' },
  { key: 'love' as const, icon: Heart, label: 'Love', color: 'text-red-500' },
  { key: 'insightful' as const, icon: Lightbulb, label: 'Insightful', color: 'text-yellow-500' },
  { key: 'curious' as const, icon: HelpCircle, label: 'Curious', color: 'text-purple-500' },
];

export function ReactionBreakdownTooltip({ breakdown, totalReactions, className }: ReactionBreakdownProps) {
  if (!breakdown || totalReactions === 0) return null;

  const sortedReactions = reactionConfig
    .map(r => ({ ...r, count: breakdown[r.key] }))
    .filter(r => r.count > 0)
    .sort((a, b) => b.count - a.count);

  if (sortedReactions.length === 0) return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn('cursor-help', className)}>
            <Heart className="h-3 w-3" />
            <span>{totalReactions}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent className="p-3 w-48">
          <div className="space-y-2">
            <p className="text-xs font-mono text-muted-foreground mb-2">REACTION MIX</p>
            {sortedReactions.map(({ key, icon: Icon, label, color, count }) => {
              const percentage = Math.round((count / totalReactions) * 100);
              return (
                <div key={key} className="flex items-center gap-2 text-xs">
                  <Icon className={cn('h-3.5 w-3.5', color)} />
                  <span className="flex-1 truncate">{label}</span>
                  <span className="font-mono tabular-nums">{count}</span>
                  <span className="text-muted-foreground w-8 text-right">{percentage}%</span>
                </div>
              );
            })}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface ReactionBreakdownChartProps {
  breakdown: ReactionBreakdownType | null | undefined;
  totalReactions: number;
  className?: string;
}

export function ReactionBreakdownChart({ breakdown, totalReactions, className }: ReactionBreakdownChartProps) {
  if (!breakdown || totalReactions === 0) {
    return (
      <div className={cn('text-center py-4 text-muted-foreground text-sm', className)}>
        No reaction data available
      </div>
    );
  }

  const sortedReactions = reactionConfig
    .map(r => ({ ...r, count: breakdown[r.key] }))
    .filter(r => r.count > 0)
    .sort((a, b) => b.count - a.count);

  return (
    <div className={cn('space-y-3', className)}>
      {sortedReactions.map(({ key, icon: Icon, label, color, count }) => {
        const percentage = Math.round((count / totalReactions) * 100);
        return (
          <div key={key} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Icon className={cn('h-4 w-4', color)} />
                <span>{label}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono tabular-nums">{count.toLocaleString()}</span>
                <span className="text-muted-foreground w-10 text-right">{percentage}%</span>
              </div>
            </div>
            <Progress value={percentage} className="h-1.5" />
          </div>
        );
      })}
    </div>
  );
}
