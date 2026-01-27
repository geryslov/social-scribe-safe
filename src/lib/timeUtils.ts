import { format } from 'date-fns';

/**
 * Returns a LinkedIn-style relative time string
 * - Under 1 hour: "45m"
 * - Under 24 hours: "3h"
 * - Under 7 days: "2d"
 * - Under 30 days: "2w"
 * - Older: "Jan 15, 2026"
 */
export function getRelativeTime(date: Date | string): string {
  const targetDate = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - targetDate.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  const diffWeeks = Math.floor(diffDays / 7);

  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  if (diffWeeks < 4) return `${diffWeeks}w`;
  return format(targetDate, 'MMM d, yyyy');
}
