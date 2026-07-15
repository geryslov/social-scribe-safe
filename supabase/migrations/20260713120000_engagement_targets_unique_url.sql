-- engagement_targets never got a uniqueness rule: two CREATE TABLE migrations
-- exist and the one that applied omitted it, so the client's "skip duplicates"
-- catch was dead code and every re-import stacked another copy of the contact.
--
-- Key on linkedin_username, NOT linkedin_url. The live data has the same person
-- stored twice under http:// and https:// variants of one profile (mayaberi,
-- toniaansetta, yvesgrillaert) — a raw-URL constraint treats those as distinct
-- strings and lets the duplicate through. The username is the profile's identity.
--
-- Existing duplicates are MERGED, not deleted: engagement_posts cascades to
-- engagement_comments, so dropping a duplicate outright could take drafted or
-- posted comments with it. Verified against production before writing: 5
-- duplicate rows across 4 people, all carrying 0 comments, so the comment
-- relocation below is a no-op today — it is here so this stays correct if the
-- migration is ever re-run against data where it isn't.

BEGIN;

-- Usernames are the key now, so they must be case-stable.
UPDATE public.engagement_targets
SET linkedin_username = lower(linkedin_username)
WHERE linkedin_username IS NOT NULL
  AND linkedin_username <> lower(linkedin_username);

-- Surviving row per (workspace, publisher, username): prefer one that actually
-- enriched, then the oldest. NULL usernames are left alone — they cannot collide.
CREATE TEMP TABLE target_merge_map ON COMMIT DROP AS
WITH ranked AS (
  SELECT
    id,
    first_value(id) OVER (
      PARTITION BY workspace_id, publisher_id, linkedin_username
      ORDER BY (enrichment_status = 'succeeded') DESC, created_at ASC
    ) AS keeper_id,
    row_number() OVER (
      PARTITION BY workspace_id, publisher_id, linkedin_username
      ORDER BY (enrichment_status = 'succeeded') DESC, created_at ASC
    ) AS rn
  FROM public.engagement_targets
  WHERE linkedin_username IS NOT NULL
)
SELECT id AS loser_id, keeper_id FROM ranked WHERE rn > 1;

-- A post the keeper already holds under the same URN is the same LinkedIn post
-- scraped twice. Move any comments onto the keeper's copy before discarding it.
UPDATE public.engagement_comments c
SET post_id = keeper_post.id
FROM public.engagement_posts loser_post
JOIN target_merge_map m ON m.loser_id = loser_post.target_id
JOIN public.engagement_posts keeper_post
  ON keeper_post.target_id = m.keeper_id
 AND keeper_post.linkedin_post_urn IS NOT DISTINCT FROM loser_post.linkedin_post_urn
WHERE c.post_id = loser_post.id
  AND loser_post.linkedin_post_urn IS NOT NULL;

DELETE FROM public.engagement_posts loser_post
USING target_merge_map m, public.engagement_posts keeper_post
WHERE loser_post.target_id = m.loser_id
  AND keeper_post.target_id = m.keeper_id
  AND keeper_post.linkedin_post_urn IS NOT DISTINCT FROM loser_post.linkedin_post_urn
  AND loser_post.linkedin_post_urn IS NOT NULL;

-- Anything the keeper does NOT already have moves across intact, comments included.
UPDATE public.engagement_posts p
SET target_id = m.keeper_id
FROM target_merge_map m
WHERE p.target_id = m.loser_id;

-- Duplicates now hold nothing; removing them cascades to nothing.
DELETE FROM public.engagement_targets t
USING target_merge_map m
WHERE t.id = m.loser_id;

-- Plain-column constraint (not an expression index) so PostgREST's on_conflict
-- can target it from the client upsert.
ALTER TABLE public.engagement_targets
  ADD CONSTRAINT engagement_targets_workspace_publisher_username_key
  UNIQUE (workspace_id, publisher_id, linkedin_username);

-- Supports the stale-`processing` sweep in bulk-enrich-targets.
CREATE INDEX IF NOT EXISTS idx_engagement_targets_enrichment_status
  ON public.engagement_targets(workspace_id, enrichment_status);

COMMIT;
