# ThoughtOS Design System

> LinkedIn content management & analytics platform for thought leaders and teams.

---

## 1. Style Direction

**Primary Style:** Enterprise SaaS (Glassmorphism + Flat hybrid)
**Secondary:** Data-Dense for analytics views, Minimalism for content authoring

### Design Principles
1. **Clarity first** - Dashboard data must be scannable in <3 seconds
2. **Professional trust** - Violet/indigo palette conveys modern authority
3. **Subtle depth** - Glass cards and soft shadows, never heavy 3D effects
4. **Content-forward** - UI chrome stays quiet; user content is the hero

### Effects & Motion
- Card hover: `translateY(-2px)` + border glow, 200ms ease-out
- Micro-interactions: 150-250ms, ease-out for enter, ease-in for exit
- Loading: skeleton shimmer (primary tint), not spinners
- Modals/sheets: scale(0.98) + fade in, 200ms
- Respect `prefers-reduced-motion`: disable transforms, keep opacity fades

### Anti-Patterns (AVOID)
- Excessive neon glow / pulsing animations in data-heavy views
- Dark mode by default (keep light as primary, dark as optional)
- Decorative-only animation that doesn't convey state change
- Emoji as structural icons (use Lucide React throughout)
- Mixing filled and outline icon styles at same hierarchy level

---

## 2. Color System

### Semantic Tokens (HSL)

| Token | Light Mode | Hex | Purpose |
|---|---|---|---|
| `--background` | `220 20% 98%` | #F8FAFC | Page background |
| `--foreground` | `222 47% 11%` | #1E293B | Primary text |
| `--card` | `0 0% 100%` | #FFFFFF | Card surfaces |
| `--card-foreground` | `222 47% 11%` | #1E293B | Card text |
| `--primary` | `263 70% 58%` | #7C3AED | Brand violet, CTAs, active states |
| `--primary-foreground` | `0 0% 100%` | #FFFFFF | Text on primary |
| `--secondary` | `220 14% 96%` | #F1F5F9 | Secondary surfaces, inactive tabs |
| `--secondary-foreground` | `222 47% 11%` | #1E293B | Text on secondary |
| `--accent` | `189 94% 43%` | #06B6D4 | Cyan accent, info highlights, links |
| `--accent-foreground` | `0 0% 100%` | #FFFFFF | Text on accent |
| `--muted` | `220 14% 96%` | #F1F5F9 | Muted backgrounds |
| `--muted-foreground` | `220 9% 46%` | #64748B | Secondary text, labels |
| `--destructive` | `0 84% 60%` | #EF4444 | Errors, delete actions |
| `--success` | `142 76% 45%` | #22C55E | Positive metrics, confirmations |
| `--warning` | `38 92% 50%` | #F59E0B | Caution states |
| `--info` | `189 94% 43%` | #06B6D4 | Informational (same as accent) |
| `--border` | `220 13% 91%` | #E2E8F0 | Borders, dividers |
| `--ring` | `263 70% 58%` | #7C3AED | Focus rings |

### Brand Gradient
```css
/* Primary gradient: Violet -> Cyan */
background: linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--accent)) 100%);
```

### Chart Colors (Accessible, Colorblind-Safe)
| Series | Hex | Use |
|---|---|---|
| Series 1 | `#7C3AED` | Primary metric (impressions) |
| Series 2 | `#06B6D4` | Secondary metric (engagement) |
| Series 3 | `#F59E0B` | Tertiary (reshares) |
| Series 4 | `#22C55E` | Positive (growth) |
| Series 5 | `#EF4444` | Negative (decline) |
| Series 6 | `#8B5CF6` | Extended (reactions) |

**Rule:** Never rely on color alone - use line styles (solid/dashed/dotted), icons, or labels alongside color.

### Contrast Requirements
- Body text on background: >= 4.5:1 (WCAG AA) - current: #1E293B on #F8FAFC = ~12:1 (PASS)
- Muted text: >= 4.5:1 - current: #64748B on #F8FAFC = ~4.6:1 (PASS, borderline)
- Primary on white: #7C3AED on #FFFFFF = ~4.3:1 (BORDERLINE - use only for large text/icons, not small body text)

---

## 3. Typography

### Font Stack
| Role | Font | Weights | Use |
|---|---|---|---|
| **Sans (UI)** | Inter | 300, 400, 500, 600, 700 | All UI text, headings, labels |
| **Mono (Data)** | IBM Plex Mono | 400, 500, 600 | Metrics, numbers, code, timestamps |

**Why Inter:** Already in use, excellent for dashboards, variable font support, tabular figures built-in.

### Type Scale
| Level | Size | Weight | Line Height | Letter Spacing | Use |
|---|---|---|---|---|---|
| Display | 36px / 2.25rem | 700 | 1.1 | -0.025em | Page titles, hero stats |
| H1 | 30px / 1.875rem | 600 | 1.2 | -0.02em | Section headers |
| H2 | 24px / 1.5rem | 600 | 1.3 | -0.02em | Card headers, tabs |
| H3 | 20px / 1.25rem | 600 | 1.4 | -0.015em | Subsection headers |
| H4 | 16px / 1rem | 600 | 1.5 | -0.01em | Table headers, small labels |
| Body | 16px / 1rem | 400 | 1.6 | 0 | Default paragraph text |
| Body Small | 14px / 0.875rem | 400 | 1.5 | 0 | Table cells, secondary text |
| Caption | 12px / 0.75rem | 500 | 1.4 | 0.02em | Timestamps, chart labels |
| Label | 12px / 0.75rem | 500 | 1.4 | 0.05em | Uppercase labels (`.label-muted`) |
| Data Value | 24-36px | 600 (mono) | 1.1 | 0 | KPI numbers, stats |

### Rules
- Headings: Inter, `font-weight: 600`, negative letter-spacing (-0.02em)
- Body: Inter, `font-weight: 400`, `line-height: 1.6`
- Numbers/metrics: IBM Plex Mono, `font-feature-settings: 'tnum'` for tabular alignment
- Minimum body text: 14px (never below 12px for any visible text)
- Line length: 60-75 characters max for readability

---

## 4. Spacing & Layout

### Spacing Scale (4px base)
| Token | Value | Use |
|---|---|---|
| `space-0.5` | 2px | Hairline gaps |
| `space-1` | 4px | Tight element gaps |
| `space-2` | 8px | Inline spacing, icon gaps |
| `space-3` | 12px | Compact padding |
| `space-4` | 16px | Standard padding, card padding |
| `space-5` | 20px | Between form fields |
| `space-6` | 24px | Between card sections |
| `space-8` | 32px | Between major sections |
| `space-10` | 40px | Page section gaps |
| `space-12` | 48px | Large section separators |

### Breakpoints
| Name | Width | Columns | Gutter |
|---|---|---|---|
| Mobile | 375px | 4 | 16px |
| Tablet | 768px | 8 | 24px |
| Desktop | 1024px | 12 | 24px |
| Wide | 1440px (max-w: 1400px) | 12 | 32px |

### Border Radius Scale
| Token | Value | Use |
|---|---|---|
| `--radius` (lg) | 12px (0.75rem) | Cards, modals, dropdowns |
| `md` | 10px | Buttons, inputs |
| `sm` | 8px | Tags, small elements |
| `full` | 9999px | Avatars, badges, pills |

### Z-Index Scale
| Layer | Value | Use |
|---|---|---|
| Base | 0 | Default content |
| Dropdown | 10 | Menus, popovers |
| Sticky | 20 | Sticky headers |
| Overlay | 40 | Modal backdrops |
| Modal | 50 | Modals, sheets |
| Toast | 100 | Toast notifications |

---

## 5. Component Patterns

### Cards
- **Default:** White bg, 1px border (`--border`), `--radius` corners, subtle shadow
- **Glass:** `backdrop-filter: blur(20px)`, 90% white opacity, for overlay contexts
- **Elevated:** Multi-layer shadow for high-emphasis cards (stats, featured)
- **Neon:** Top 3px gradient bar (violet -> cyan), for highlighted/featured items

### Buttons
| Variant | Background | Border | Shadow | Use |
|---|---|---|---|---|
| Primary | Violet gradient | none | violet glow | Main CTAs |
| Secondary | `--secondary` | 1px `--border` | none | Secondary actions |
| Ghost | transparent | none | none | Toolbar actions |
| Destructive | `--destructive` | none | none | Delete, remove |
| Outline | transparent | 2px `--primary` | none | Alternate CTAs |

### Interactive States
- **Hover:** Shift bg color, add subtle shadow, `transition: all 200ms ease`
- **Active/Pressed:** `scale(0.98)`, deeper color
- **Focus:** 2px solid `--ring` outline, 2px offset
- **Disabled:** `opacity: 0.5`, `cursor: not-allowed`
- **Loading:** Disable button + inline spinner, preserve button width

### Forms
- Input height: 40px (min touch target: 44px including padding)
- Always use visible labels (never placeholder-only)
- Error messages below field, red text with icon
- Helper text in muted-foreground below inputs
- Validate on blur, not on keystroke

---

## 6. Charts & Data Visualization

### Chart Types by Use Case
| Data | Chart | Library |
|---|---|---|
| Engagement over time | Line / Area chart | Recharts |
| Impressions trend | Smooth area chart | Recharts |
| Reaction breakdown | Horizontal bar chart | Recharts |
| Post performance comparison | Grouped bar chart | Recharts |
| Follower growth | Area chart with gradient fill | Recharts |
| Publisher ranking | Horizontal bar + avatar | Recharts |

### Chart Styling
- Grid lines: `#E2E8F0` (very subtle, 1px)
- Axis labels: 12px Inter, `--muted-foreground`
- Tooltips: White bg, border, shadow, 14px body text
- Area fills: 20% opacity of series color
- Data points: 4px circles, visible on hover
- Always show legend when 2+ series
- Provide data table fallback for screen readers

### KPI Stat Cards
- Large number: IBM Plex Mono, 28-36px, `--foreground`
- Label: 12px uppercase, `--muted-foreground`
- Trend indicator: green up-arrow or red down-arrow + percentage
- Card variant: `card-neon` for featured KPIs, `card-elevated` for standard

---

## 7. Accessibility Checklist

- [x] Color contrast >= 4.5:1 for all text (verify muted text)
- [x] Focus rings on all interactive elements (2px solid violet)
- [x] Keyboard navigation: tab order matches visual order
- [x] Aria-labels on icon-only buttons
- [x] Skip-to-content link
- [x] Heading hierarchy (h1 -> h2 -> h3, no skips)
- [x] Color is never the only indicator (add icons/text)
- [x] Reduced motion support
- [x] Touch targets >= 44x44px on interactive elements
- [x] Form labels associated with inputs
- [x] Error messages near the relevant field
- [x] Chart data available as table for screen readers

---

## 8. Icon System

**Library:** Lucide React (already installed)
**Size scale:**
| Size | px | Use |
|---|---|---|
| `sm` | 16px | Inline with text, badges |
| `md` | 20px | Buttons, nav items, table actions |
| `lg` | 24px | Page headers, empty states |
| `xl` | 32px | Feature highlights |

**Rules:**
- Consistent 1.5px stroke weight throughout
- Always pair with text label in navigation (icon-only allowed only with aria-label)
- Use semantic color: default `--muted-foreground`, active `--primary`, error `--destructive`
