## Deliverable

A polished, investor/sales-oriented PDF saved to `/mnt/documents/ThoughtOS-Features-Overview.pdf` covering every feature in the product, with a "what it does" and "how it works under the hood" section for each.

Tone: confident, benefits-led, technically credible (so it doubles as a sales leave-behind and a due-diligence primer). No fluff, no emojis, ThoughtOS brand colors (violet `#7C3AED` + cyan `#06B6D4`).

## Structure of the PDF

```text
Cover
  - ThoughtOS logo, tagline, date
Executive summary
  - One paragraph on the category (multi-publisher LinkedIn orchestration)
  - 4 KPI tiles: # of feature pillars, integrations, AI models, data points tracked
Section 1 — Workspaces & access
Section 2 — Publishers & LinkedIn identity
Section 3 — Content creation (AI documents, sections, drafts)
Section 4 — Publishing pipeline (scheduling, direct push, media)
Section 5 — Analytics & intelligence
Section 6 — Audience & engagers (reactors, commenters, export)
Section 7 — Slack & notifications
Section 8 — Automation & sync engine
Section 9 — Security & multi-tenant isolation
Appendix — Tech stack and AI model routing
```

Each feature card uses the same two-block format:

```text
┌─────────────────────────────────────────┐
│ FEATURE NAME                            │
│ What it does (1–3 sentences, benefit)   │
│ ───────────────────────────────────────│
│ How it works (data flow, models, APIs)  │
└─────────────────────────────────────────┘
```

## Features that will be documented

Drawn from project memory + codebase:

1. **Multi-tenant workspaces** — invite links, `/w/:slug` routing, RLS isolation, workspace switcher, custom branding (logo, theme CSS vars).
2. **Admin role & access control** — global admin dashboard, role-based gating, signup restrictions.
3. **LinkedIn SSO & publisher identity** — OpenID Connect, Base64 state param, scope set, avatar snapshotting, vanity URL derivation, company enrichment.
4. **Publisher sidebar & assignment** — bulk assignment tool, document/section ownership, deletion constraints.
5. **AI document creation** — Claude 4.5 Sonnet for high-volume parsing/generation, Gemini for rewrites, tone personas, multi-source URL ingestion, PDF chunked extraction with vision fallback, mandatory appendix architecture.
6. **Document editor** — section parsing (markdown + unstructured), auto-draft creation per section, edit history with LCS diffing, comments (workspace-scoped).
7. **Content framework** — hook-driven micro-paragraphs, no-bold rule, sourced appendix.
8. **Post creation & media** — image/video upload, file-size bounds, inline media edits in feed.
9. **Direct LinkedIn publishing** — push-button posting, scheduling via pg_cron auto-publish scheduler.
10. **LinkedIn analytics** — internal + external post tracking via URNs, snapshot history, unique reach vs impressions, momentum/week-over-week velocity, reaction-type breakdown, video milestones, conversation depth, link clicks, organic vs paid (Ads API).
11. **Follower growth tracking** — snapshot history charting.
12. **Post-level analytics UI** — PostRow metrics, drill-down filters on the Posts page.
13. **Engagers** — reactor + commenter tracking, deduplicated audience view, per-workspace CSV export.
14. **Slack notifications** — published-post alerts + new-reaction alerts via `net.http_post` trigger.
15. **Sync engine** — auto-sync timer, manual "Sync now", per-publisher results popover with Slack-notification counts, API versioning + cooldown caching.
16. **Security** — publisher OAuth token isolation, RLS everywhere, workspace authorization rules.

## How the PDF will be built

- Python + ReportLab Platypus (already covered by the bundled PDF skill).
- Brand palette applied via custom `ParagraphStyle`s; section dividers in violet, accent rules in cyan.
- Cover page with large wordmark, subtle gradient band.
- Body in a clean sans (Helvetica fallback — ReportLab built-in to avoid font-embedding issues).
- Two-column feature cards on letter-size pages with generous whitespace.
- Page numbers + footer with "ThoughtOS — Confidential".

## Process

1. Read a small set of files to confirm current feature surface (Posts page, Analytics page, NextSyncTimer, useAutoSync, fetch-linkedin-posts edge function, workspace hooks) — purely to make claims accurate.
2. Generate `/tmp/build_features_pdf.py` and run it.
3. QA: render every page to JPG via `pdftoppm`, inspect for overflow/clipping/contrast, iterate until clean.
4. Deliver via `<presentation-artifact>` pointing at `ThoughtOS-Features-Overview.pdf`.

## Out of scope

- No code or UI changes in the app.
- No screenshots of the live product (kept text-only for speed; can add in a follow-up if you want a richer deck).
- No pricing, roadmap, or financials — features only.
