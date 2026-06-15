# CLAUDE.md — Social-Scribe-Safe (ThoughtOS)

## What This Is
Multi-tenant LinkedIn thought leadership platform. Agency operators manage publishers (clients), generate AI-written posts, publish to LinkedIn, track analytics, and engage with other people's content.

## Stack
- **Frontend:** React + TypeScript + Vite + Tailwind + shadcn/ui
- **Backend:** Supabase (PostgreSQL + Edge Functions + RLS + Auth)
- **AI:** Claude Sonnet 4.5 via Anthropic API (post generation, voice profiles, comment classification + generation)
- **External APIs:** Apify (LinkedIn post scraping, profile enrichment), Firecrawl (LinkedIn profile scraping), LinkedIn Community Management API (posting, commenting, liking, reactions)
- **Deployment:** Lovable (auto-deploys from GitHub). Edge Functions must be redeployed via Lovable sync or Supabase dashboard after changes.
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
| `create-document` | AI post generation with 690-line system prompt, multi-publisher voice profiles. WRITER ANALYSIS section uses voice profiles when available. Multi-publisher docs get per-voice labeling. |
| `generate-comment` | **Post classification agent** — classifies post type (announcement, opinion, educational, etc.), then generates comment using type-specific strategy + publisher voice profile. Dedicated function, does NOT route through create-document. max_tokens: 100. |
| `generate-voice-profile` | Scrapes LinkedIn (Firecrawl → Apify fallback) + analyzes existing posts → generates structured voice profile per publisher. Bans LinkedIn influencer phrases from vocabulary. |
| `fetch-comment-engagement` | Queries LinkedIn Social Metadata API for reactions + replies on posted comments. Batch support (10 at a time). |
| `run-research` | Intelligence layer: Reddit + HN + Brave search → engagement-ranked feed |
| `fetch-target-posts` | Apify: fetches LinkedIn posts from engagement targets (async run + poll). Filters out reposts. Also extracts profile data (avatar, title, company) from author info. |
| `post-linkedin-comment` | Posts comments via LinkedIn Community Management API. Tries multiple URN variants. Updates engagement_comment status with dual-write (server + client fallback). |
| `like-linkedin-post` | Likes posts via LinkedIn Reactions API |
| `enrich-engagement-target` | Apify: enriches engagement target with profile data (name, title, company, avatar) |
| `linkedin-post` | Publishes posts to LinkedIn |
| `linkedin-auth` | LinkedIn OAuth flow |
| `fetch-linkedin-posts` | Fetches publisher's own post analytics |
| `parse-document` | PDF/DOCX/CSV file parsing |
| `split-document` | Splits documents into sections |
| `rewrite-section` | AI section rewriting |
| `scrape-linkedin` | Firecrawl profile scraping (avatar) |
| `notify-slack` / `notify-slack-reaction` | Slack webhook notifications |

### Core Tables
- `publishers` — LinkedIn profiles/clients with `voice_profile` TEXT + `voice_profile_generated_at`, OAuth tokens
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
- `engagement_folders` — Per-publisher folders for organizing targets. Fields: workspace_id, publisher_id, name, position. Targets reference via nullable `engagement_targets.folder_id` (ON DELETE SET NULL = falls back to "Unfiled" when a folder is removed).
- `engagement_targets` — People to monitor. Fields: name, linkedin_url, linkedin_username, headline, title, company_name, avatar_url, first_name, last_name, enrichment_status, enriched_at, last_seen_at, last_fetched_at, auto_like, is_active, folder_id (nullable FK to engagement_folders)
- `engagement_posts` — Fetched LinkedIn posts from targets. Fields: linkedin_post_urn, linkedin_post_url, content, published_at, likes/comments/shares_count, is_commented, is_liked, liked_at, post_metadata JSONB
- `engagement_comments` — Comments drafted/posted on target posts. Fields: comment_text, status (draft/posted/failed), linkedin_comment_urn, posted_at, error_message, reaction_count, reply_count, reactions_breakdown JSONB, engagement_fetched_at

### Comment Classification Agent
The `generate-comment` function runs a two-phase process:
1. **Phase 1 — Classify** (silent): Identifies post_type, subject, key_entities, core_event, emotional_tone. 11 known types + dynamic creation for unknown types.
2. **Phase 2 — Generate**: Uses type-specific strategy + publisher voice profile.

Known types: announcement_funding, announcement_launch, announcement_hire, announcement_milestone, opinion_hot_take, opinion_lesson, data_insight, story_personal, educational, question, promotion.

Global banned language (enforced in comments AND voice profiles): "changes everything", "game changer", "keeps me up at night", "let that sink in", "couldn't agree more", "spot on", em dashes, all LinkedIn influencer phrases.

### Voice Profiles
Stored on `publishers.voice_profile` TEXT column. Generated by `generate-voice-profile` Edge Function. Used in:
- `create-document` — injected per-publisher for post generation
- `generate-comment` — shapes comment tone/vocabulary
- `CommentComposer` — passes voice_profile to generate-comment

Voice profile structure: Professional Identity, Writing Voice, Content Themes, Vocabulary & Phrasing (with banned phrases), Perspective & Worldview.

## UI Pages
- `/` — Posts (main feed, publisher sidebar)
- `/analytics` — Workspace analytics
- `/documents` — Document library + AI generation
- `/documents/:id` — Document editor with sections
- `/intelligence` — Research feed (Feed, Topics, Settings tabs)
- `/engagement` — Master-detail CRM layout: contact list (left 320px) + post panel (right). Per-publisher folder strip scopes the entire view (queue, watching list, day counter). Bulk import, unseen badges, profile auto-enrichment, post classification agent for comments. Auto-like has jittered spacing (first like 400-800ms for responsiveness, subsequent 6-12s) and a hard 30/day server-side cap per publisher.
- `/admin` — Admin dashboard

## Conventions
- Edge Functions: self-contained, no shared utils, CORS headers, `Deno.serve()`, service role client
- Hooks: React Query with workspace-scoped query keys, `(supabase as any)` for new tables not in generated types
- Components: shadcn/ui patterns, `cn()` for className merging
- New tables: always add RLS policies using existing security functions
- Migrations: `YYYYMMDDHHMMSS_name.sql` in `supabase/migrations/`
- After building a major feature, update this CLAUDE.md

## Preferences
- Be concise and direct
- Prefer editing existing files over creating new ones
- Don't over-engineer — ship working code
- Use `as any` cast for Supabase queries on tables not yet in generated types
- No dramatic/hyperbolic language in AI outputs
- Comments should sound human, not AI — short, casual, specific to the post
