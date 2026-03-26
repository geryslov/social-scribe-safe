# Dashboard & Analytics Pages

> Overrides for `/analytics` and `/publisher/:name`

## Style Override
- **Data-Dense** layout: prioritize information density over whitespace
- Use `card-neon` for top-row KPI stat cards
- Use `card-elevated` for chart containers
- Sidebar publisher list uses compact spacing (8px gaps)

## Layout
- KPI row: 4-column grid on desktop, 2-column on tablet, 1-column stack on mobile
- Chart grid: 2-column on desktop, single-column on mobile
- Max chart height: 300px on desktop, 240px on mobile
- Data tables: full-width, horizontal scroll on mobile with sticky first column

## Typography Override
- KPI numbers: IBM Plex Mono, 32px, weight 600, `font-feature-settings: 'tnum'`
- Trend percentages: IBM Plex Mono, 14px, color = success/destructive based on direction
- Chart axis labels: 11px Inter, `--muted-foreground`
- Time range selector: 14px Inter, weight 500

## Color Override
- Chart area fills: 15% opacity (slightly less than default 20% for data density)
- Positive trend: `--success` (#22C55E)
- Negative trend: `--destructive` (#EF4444)
- Neutral/no-change: `--muted-foreground` (#64748B)

## Interaction
- Time range filter: pill buttons (7d / 30d / 90d), active state = `--primary` bg
- Chart hover: crosshair cursor, tooltip with exact values
- KPI cards: no hover transform (static, data-focused)
- Publisher ranking: clickable rows navigate to `/publisher/:name`

## Charts
- Engagement trend: Smooth area chart, gradient fill (violet 15% -> transparent)
- Reaction breakdown: Horizontal stacked bar, one bar per reaction type
- Top posts: Horizontal bar chart sorted by impressions
- Follower growth: Area chart with `--accent` (cyan) fill
