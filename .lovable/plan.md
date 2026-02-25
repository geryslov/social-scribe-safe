

## Plan: Add "Who Reacted" and "Who Commented" to Post Analytics

### Context

The LinkedIn Reactions API already returns individual reaction elements with an `actor` URN (e.g., `urn:li:person:rboDhL7Xsf`) and `reactionType`. The Comments API at `/rest/socialActions/{postUrn}/comments` returns comments with `actor` URN and `message.text`. However, resolving actor URNs to full names requires the People API (`r_liteprofile` or similar), which we already have in our scopes (`r_basicprofile`, `r_liteprofile`).

### What Changes

**1. Database: New tables for reactor/commenter data**

- Create a `post_reactors` table: `id`, `post_id`, `actor_urn`, `actor_name`, `actor_headline`, `actor_profile_url`, `reaction_type`, `reacted_at`, `created_at`
- Extend existing `post_comments` table to ensure it stores `author_name`, `author_headline`, `author_profile_url`, `content`, `commented_at` (most columns exist, add `author_headline` and `author_profile_url`)

**2. Edge Function: `fetch-linkedin-posts/index.ts`**

- In `fetchReactionBreakdown()`, already iterating over reaction elements — extract `actor` URN, `reactionType`, and resolve actor name via People API batch decoration (`/rest/people?ids=List(...)`)
- Store each reactor in `post_reactors` table (upsert by `post_id` + `actor_urn`)
- Add new function `fetchPostComments()` that calls `/rest/socialActions/{postUrn}/comments` to get commenters with their actor URN + message text
- Resolve commenter names via the same People API decoration
- Upsert into `post_comments` table

**3. Frontend: Display who reacted and commented**

- **ReactionBreakdown tooltip** — extend to show a list of reactor names grouped by reaction type (e.g., "👍 Like: John Smith, Jane Doe")
- **PostRow / LinkedInPostCard** — add expandable section showing recent commenters with their name, comment snippet, and reaction type
- Create a new `PostEngagersPanel` component showing:
  - Reactors list with name, headline, reaction type emoji
  - Commenters list with name, comment preview, timestamp
  - Each entry links to their LinkedIn profile

**4. Hooks**

- Add `usePostReactors(postId)` hook querying `post_reactors` table
- Add `usePostCommenters(postId)` hook querying `post_comments` table

### Technical Details

```text
LinkedIn API Calls (per post during sync):
┌─────────────────────────────────────────┐
│ GET /rest/reactions/(entity:{urn})      │ ← already called, extend to store actors
│   → elements[].actor (person URN)      │
│   → elements[].reactionType            │
├─────────────────────────────────────────┤
│ GET /rest/socialActions/{urn}/comments  │ ← NEW call
│   → elements[].actor (person URN)      │
│   → elements[].message.text            │
│   → elements[].created.time            │
├─────────────────────────────────────────┤
│ GET /rest/people?ids=List(urn1,urn2,..) │ ← NEW: batch resolve names
│   → firstName, lastName, headline      │
└─────────────────────────────────────────┘

Database:
post_reactors (NEW)
├── post_id (uuid)
├── actor_urn (text)
├── actor_name (text)
├── actor_headline (text, nullable)
├── actor_profile_url (text, nullable)
├── reaction_type (text)
├── reacted_at (timestamptz, nullable)
└── unique on (post_id, actor_urn)

post_comments (UPDATE)
├── + author_headline (text, nullable)
└── + author_profile_url (text, nullable)
```

- Actor name resolution: Use LinkedIn's People API decoration endpoint to batch-resolve URNs to names. If resolution fails (restricted access), store the URN as fallback and show "LinkedIn Member" as name.
- Rate limiting: LinkedIn has API rate limits, so we'll process reactors/commenters in batches and handle 429 responses gracefully.
- The reactions API may paginate — we'll follow `start`/`count` pagination to capture all reactors.

### Scope

- ~1 new DB migration (new table + alter existing)
- ~1 edge function update (fetch-linkedin-posts)
- ~3 new frontend components/hooks
- ~2 existing component updates (ReactionBreakdown, PostRow)

