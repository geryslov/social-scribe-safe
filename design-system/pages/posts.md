# Posts Page

> Overrides for `/` (main posts feed)

## Style Override
- **Content-forward** layout: post content is the hero, UI chrome minimal
- Use `card-glass` for post cards (subtle, non-competing)
- Publisher sidebar: compact width (240px), collapsible on tablet

## Layout
- Post list: single column, max-width 720px centered
- Post card: avatar + name + timestamp header, body text, footer with status + labels + actions
- Status tabs (Draft/Scheduled/Done): top of list, pill style
- Floating action button for "New Post" on mobile

## Typography Override
- Post body preview: 16px Inter, weight 400, line-height 1.6, max 3 lines with ellipsis
- Post metadata (timestamp, labels): 12px, `--muted-foreground`
- Status badge: 12px, weight 500, uppercase

## Interaction
- Post card click -> open PostModal (slide-in sheet or centered modal)
- Status change: dropdown with confirmation for "publish"
- Label chips: clickable to filter, removable with X icon
- Drag-to-reorder for scheduled posts (optional, with `aria-grabbed`)

## Empty State
- No posts: illustration + "Create your first post" CTA
- No results (filter active): "No posts match your filters" + clear filters link
