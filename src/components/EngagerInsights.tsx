import { useMemo } from 'react';
import { Briefcase, Building2, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HeadlineData {
  headline: string | null;
}

interface EngagerInsightsProps {
  engagers: HeadlineData[];
  className?: string;
}

// Common title keywords to normalize
const TITLE_KEYWORDS = [
  'CEO', 'CTO', 'CFO', 'COO', 'CMO', 'CRO', 'CPO', 'CHRO', 'CIO', 'CSO',
  'VP', 'Vice President', 'Director', 'Head of', 'Manager', 'Lead',
  'Senior', 'Principal', 'Staff', 'Junior',
  'Engineer', 'Developer', 'Designer', 'Analyst', 'Consultant',
  'Founder', 'Co-Founder', 'Partner', 'Owner',
  'Marketing', 'Sales', 'Product', 'Operations', 'HR', 'Finance',
];

function extractTitle(headline: string): string {
  // Take the part before "at" or "|" or "·" or "@"
  const parts = headline.split(/\s+(?:at|@)\s+|\s*[|·•–—]\s*/i);
  let title = (parts[0] || headline).trim();
  // Remove trailing company-like suffixes
  title = title.replace(/\s*[-–]\s*$/, '').trim();
  // Cap length
  if (title.length > 60) title = title.substring(0, 57) + '...';
  return title || 'Not specified';
}

function extractCompany(headline: string): string | null {
  // Try "at Company" pattern
  const atMatch = headline.match(/\b(?:at|@)\s+(.+?)(?:\s*[|·•–—]|$)/i);
  if (atMatch) {
    let company = atMatch[1].trim();
    if (company.length > 50) company = company.substring(0, 47) + '...';
    return company;
  }
  // Try after separator
  const parts = headline.split(/\s*[|·•–—]/);
  if (parts.length > 1) {
    const candidate = parts[1].trim();
    // Heuristic: if it looks like a company (starts with capital, no common title words)
    if (candidate.length > 2 && candidate.length < 60 && /^[A-Z]/.test(candidate)) {
      return candidate;
    }
  }
  return null;
}

function normalizeTitle(title: string): string {
  // Group similar titles together
  const lower = title.toLowerCase();
  
  // C-suite
  if (/\b(ceo|chief executive)\b/i.test(lower)) return 'CEO';
  if (/\b(cto|chief technology)\b/i.test(lower)) return 'CTO';
  if (/\b(cfo|chief financial)\b/i.test(lower)) return 'CFO';
  if (/\b(coo|chief operating)\b/i.test(lower)) return 'COO';
  if (/\b(cmo|chief marketing)\b/i.test(lower)) return 'CMO';
  if (/\b(cro|chief revenue)\b/i.test(lower)) return 'CRO';
  if (/\b(cpo|chief product)\b/i.test(lower)) return 'CPO';
  
  // Founder
  if (/\b(co-?founder|cofounder)\b/i.test(lower)) return 'Co-Founder';
  if (/\bfounder\b/i.test(lower)) return 'Founder';
  
  // VP
  if (/\b(vp|vice president)\b/i.test(lower)) return 'VP / Vice President';
  
  // Director
  if (/\bdirector\b/i.test(lower)) return 'Director';
  
  // Head of
  if (/\bhead of\b/i.test(lower)) return 'Head of Department';
  
  // Manager
  if (/\bmanager\b/i.test(lower)) return 'Manager';
  
  // Keep as-is for less common titles, but capitalize
  return title.length > 40 ? title.substring(0, 37) + '...' : title;
}

interface InsightBar {
  label: string;
  count: number;
  percentage: number;
}

export function EngagerInsights({ engagers, className }: EngagerInsightsProps) {
  const { titles, companies, totalWithHeadlines } = useMemo(() => {
    const titleMap = new Map<string, number>();
    const companyMap = new Map<string, number>();
    let withHeadlines = 0;

    for (const e of engagers) {
      if (!e.headline) continue;
      withHeadlines++;
      
      const rawTitle = extractTitle(e.headline);
      const normalized = normalizeTitle(rawTitle);
      titleMap.set(normalized, (titleMap.get(normalized) || 0) + 1);
      
      const company = extractCompany(e.headline);
      if (company) {
        companyMap.set(company, (companyMap.get(company) || 0) + 1);
      }
    }

    const toSorted = (map: Map<string, number>): InsightBar[] => {
      const total = Array.from(map.values()).reduce((s, v) => s + v, 0);
      return Array.from(map.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([label, count]) => ({
          label,
          count,
          percentage: total > 0 ? (count / total) * 100 : 0,
        }));
    };

    return {
      titles: toSorted(titleMap),
      companies: toSorted(companyMap),
      totalWithHeadlines: withHeadlines,
    };
  }, [engagers]);

  if (totalWithHeadlines === 0) {
    return (
      <div className={cn("text-center py-6", className)}>
        <BarChart3 className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
        <p className="text-xs text-muted-foreground">No headline data available to analyze</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-5", className)}>
      <p className="text-[10px] text-muted-foreground">
        Based on {totalWithHeadlines} engager profile{totalWithHeadlines !== 1 ? 's' : ''} with headline data
      </p>

      {/* Job Titles */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <Briefcase className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-semibold text-foreground">Top Titles</span>
        </div>
        <div className="space-y-1.5">
          {titles.map((t) => (
            <InsightBarRow key={t.label} item={t} color="primary" />
          ))}
        </div>
      </div>

      {/* Companies */}
      {companies.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Building2 className="h-3.5 w-3.5 text-info" />
            <span className="text-xs font-semibold text-foreground">Top Companies</span>
          </div>
          <div className="space-y-1.5">
            {companies.map((c) => (
              <InsightBarRow key={c.label} item={c} color="info" />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InsightBarRow({ item, color }: { item: InsightBar; color: 'primary' | 'info' }) {
  return (
    <div className="group">
      <div className="flex items-center justify-between text-[11px] mb-0.5">
        <span className="text-foreground truncate max-w-[70%]">{item.label}</span>
        <span className="text-muted-foreground font-mono tabular-nums">
          {item.count} <span className="text-[9px]">({item.percentage.toFixed(0)}%)</span>
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            color === 'primary' ? 'bg-primary/60' : 'bg-info/60'
          )}
          style={{ width: `${Math.max(item.percentage, 2)}%` }}
        />
      </div>
    </div>
  );
}
