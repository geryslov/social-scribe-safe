# CLAUDE.md — Social-Scribe-Safe (ThoughtOS)

## What This Is
Multi-tenant LinkedIn thought leadership platform. Agency operators manage publishers (clients), generate AI-written posts, publish to LinkedIn, track analytics, and engage with other people's content.

## Stack
- **Frontend:** React + TypeScript + Vite + Tailwind + shadcn/ui
- **Backend:** Supabase (PostgreSQL + Edge Functions + RLS + Auth)
- **AI:** Claude Sonnet 4.5 via Anthropic API (post generation, voice profiles, comment suggestions)
- **External APIs:** Apify (LinkedIn post scraping), Firecrawl (LinkedIn profile scraping), LinkedIn Community Management API (posting, commenting, liking)
- **Deployment:** Lovable (auto-deploys from GitHub)
- **Fonts:** DM Sans (body), Bricolage Grotesque (display), JetBrains Mono (mono)
- **Primary color:** Violet (#7C3AED), workspace-customizable via theme

## GitHub
`https://github.com/geryslov/social-scribe-safe`

## Supabase
- Project ID: `vstuoqlvakfvrowpxsae`
- URL: `https://vstuoqlvakfvrowpxsae.supabase.co`
- CLI not linked locally — deploy Edge Functions via Lovable or Supabase dashboard

## Key Architecture

### Multi-tenancy
- `workspaces` table with `workspace_id` FK on all data tables
- RLS via `user_has_workspace_access()` (SELECT) and `user_can_create_in_workspace()` (INSERT/UPDATE)
- Legacy data has `workspace_id = NULL`
- Roles: owner/admin/creator/member

### Edge Functions (supabase/functions/)
| Function | Purpose |
|---|---|
| `create-document` | AI post generation with 690-line system prompt, multi-publisher voice profiles |
| `generate-voice-profile` | Scrapes LinkedIn + analyzes writing style → saves per-publisher voice profile |
| `run-research` | Intelligence layer: Reddit + HN + Brave search → engagement-ranked feed |
| `fetch-target-posts` | Apify: fetches LinkedIn posts from engagement targets (async run + poll) |
| `post-linkedin-comment` | Posts comments via LinkedIn Community Management API |
| `like-linkedin-post` | Likes posts via LinkedIn Reactions API |
| `enrich-engagement-target` | Apify: enriches engagement target with profile data |
| `linkedin-post` | Publishes posts to LinkedIn |
| `linkedin-auth` | LinkedIn OAuth flow |
| `fetch-linkedin-posts` | Fetches publisher's own post analytics |
| `parse-document` | PDF/DOCX/CSV file parsing |
| `split-document` | Splits documents into sections |
| `rewrite-section` | AI section rewriting |
| `scrape-linkedin` | Firecrawl profile scraping (avatar) |
| `notify-slack` / `notify-slack-reaction` | Slack webhook notifications |

### Core Tables
- `publishers` — LinkedIn profiles/clients with voice_profile, OAuth tokens
- `documents` / `document_sections` — AI-generated content with sections
- `posts` — LinkedIn posts with full analytics tracking
- `workspaces` / `workspace_members` — Multi-tenant workspaces

### Intelligence Layer Tables
- `monitoring_topics` — Per-publisher research keywords (company/product/category)
- `intelligence_items` — Research results ranked by engagement score
- `research_runs` — Research execution history
- `workspace_research_settings` — Schedule config
- `workspace_api_keys` — Per-workspace API keys (Brave, Apify, etc.)

### Engagement Layer Tables
- `engagement_targets` — People to monitor (with profile data, voice profiles)
- `engagement_posts` — Fetched LinkedIn posts from targets
- `engagement_comments` — Comments drafted/posted on target posts

## Conventions
- Edge Functions: self-contained, no shared utils, CORS headers, `Deno.serve()`, service role client
- Hooks: React Query with workspace-scoped query keys, `(supabase as any)` for new tables not in generated types
- Components: shadcn/ui patterns, `cn()` for className merging
- New tables: always add RLS policies using existing security functions
- Migrations: `YYYYMMDDHHMMSS_name.sql` in `supabase/migrations/`

## Preferences
- Be concise and direct
- Prefer editing existing files over creating new ones
- Don't over-engineer — ship working code
- Use `as any` cast for Supabase queries on tables not yet in generated types
