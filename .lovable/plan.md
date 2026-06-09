## Goal

When a new engagement target (person to engage with) is added, automatically fetch their LinkedIn profile via Apify and populate first name, last name, job title, company name, and profile picture so the user doesn't have to type them in.

## What changes for the user

- The "Add Person" dialog only needs the LinkedIn profile URL. Name becomes optional (auto-filled if blank).
- After saving, the target row updates within a few seconds with the real name, headline (title @ company), avatar, and company name pulled from LinkedIn.
- If enrichment fails (bad URL, Apify down, no Apify key on workspace), the target is still created with whatever the user typed, and a small "Enrichment failed" badge is shown so they can retry.

## Implementation

### 1. Database (migration)

Add columns to `engagement_targets`:
- `first_name text`
- `last_name text`
- `title text` (job title)
- `company_name text`
- `enrichment_status text` — one of `pending`, `succeeded`, `failed`, nullable
- `enriched_at timestamptz`

Existing `name`, `headline`, `avatar_url`, `linkedin_username` stay and get populated by enrichment too.

### 2. New edge function: `enrich-engagement-target`

- Input: `{ target_id }`
- Loads the target + the workspace's Apify token from `workspace_api_keys` (service `apify`), matching the pattern already used by `fetch-target-posts`.
- Calls Apify actor `harvestapi/linkedin-profile-scraper` (synchronous run-sync-get-dataset-items endpoint, max 60s) with the target's `linkedin_url`.
- Maps the returned profile fields:
  - `firstName` → `first_name`
  - `lastName` → `last_name`
  - `firstName + " " + lastName` → `name` (always overwrite if user left blank, otherwise keep user value)
  - `headline` → `headline`
  - `jobTitle` / current position title → `title`
  - current position `companyName` → `company_name`
  - profile picture URL → `avatar_url` (uploaded to the existing `publisher-avatars` bucket so LinkedIn CDN expiry doesn't break it, mirroring the snapshotting pattern already used for publishers)
- Updates the row with `enrichment_status = 'succeeded'` and `enriched_at = now()`. On any failure sets `failed` and logs the reason.

### 3. Client wiring

In `src/hooks/useEngagement.tsx` `createTarget`:
- After the insert succeeds, fire-and-await `supabase.functions.invoke('enrich-engagement-target', { body: { target_id: result.id } })`.
- Invalidate `engagement-targets` query again on completion so the enriched fields render.

In `TargetList.tsx` and `ContactList.tsx` add-person dialogs:
- Make Name optional (URL is the only required field).
- Show a "Auto-filling from LinkedIn…" spinner on the new row while `enrichment_status = 'pending'`.
- If `enrichment_status = 'failed'`, show a small inline "Retry" button that re-invokes the edge function.

### 4. Display

- `ContactList.tsx` / `TargetList.tsx` row: show `title @ company_name` under the name when present, falling back to `headline`.
- Use `avatar_url` if set (already wired with `referrerPolicy="no-referrer"`).

## Technical notes

- The Apify actor slug above (`harvestapi/linkedin-profile-scraper`) is the profile-scraping companion to the posts actor already in use. If the workspace's Apify account doesn't have it enabled, the function falls back to deriving name from `linkedin_username` and marks enrichment as failed.
- All Apify calls go through the edge function — the token never leaves the backend.
- No changes to RLS — existing `Creators update targets` policy already lets the enrichment run (called via service role inside the edge function anyway).
