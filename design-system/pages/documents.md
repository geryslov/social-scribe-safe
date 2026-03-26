# Documents Pages

> Overrides for `/documents` (library) and `/documents/:id` (editor)

## Document Library (`/documents`)

### Style
- Card grid layout: 3-column desktop, 2-column tablet, 1-column mobile
- Document cards: `card-elevated`, show title + status badge + date + word count
- Status color coding: draft = muted, in_review = warning, approved = success, split = primary

### Layout
- Filter bar: status filter tabs + search input + sort dropdown
- Card aspect: no fixed height, content-driven
- Upload area: dashed border drop zone at top (or "+" card at end of grid)

## Document Editor (`/documents/:id`)

### Style
- **Minimalism** override: maximum content focus, minimal chrome
- Split view: document content (left 60%) + sections panel (right 40%)
- Resizable panels (react-resizable-panels already in use)

### Typography Override
- Document title: 28px, weight 700, editable inline
- Section headings: 20px, weight 600
- Section body: 16px, weight 400, line-height 1.7 (slightly more generous for reading)
- Comment text: 14px, muted background bubble

### Interaction
- Section hover: subtle left-border highlight in `--primary`
- Rewrite button: ghost button, shows AI options dropdown (tone, length)
- Comment thread: collapsible, anchored to section
- Version history: timeline sidebar, diff view on click
- Auto-save indicator: small "Saved" text with checkmark, fades after 2s

### Edit History
- Timeline dots connected by vertical line
- Each entry: avatar + name + action + timestamp
- Diff: red/green inline for text changes
