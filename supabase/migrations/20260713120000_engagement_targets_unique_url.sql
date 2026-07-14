-- engagement_targets never got the UNIQUE(workspace_id, publisher_id, linkedin_url)
-- constraint: two CREATE TABLE migrations exist and the one that applied omitted it.
-- Duplicate contacts have therefore been accumulating on every re-import, and the
-- client's "skip duplicates" catch was dead code.
--
-- Add the constraint so bulk import can upsert. Existing duplicates are MERGED,
-- not deleted: engagement_posts cascades to engagement_comments, so dropping a
-- duplicate target outright would take real drafted/posted comments with it.
-- Each duplicate's posts are relocated onto the surviving target first, leaving
-- the duplicate row empty before it is removed.

BEGIN;

-- Surviving row per (workspace, publisher, url): prefer one that actually
-- enriched, then the oldest.
CREATE TEMP TABLE target_merge_map ON COMMIT DROP AS
WITH ranked AS (
  SELECT
    id,
    first_value(id) OVER (
      PARTITION BY workspace_id, publisher_id, linkedin_url
      ORDER BY (enrichment_status = 'succeeded') DESC, created_at ASC
    ) AS keeper_id,
    row_number() OVER (
      PARTITION BY workspace_id, publisher_id, linkedin_url
      ORDER BY (enrichment_status = 'succeeded') DESC, created_at ASC
    ) AS rn
  FROM public.engagement_targets
)
SELECT id AS loser_id, keeper_id FROM ranked WHERE rn > 1;

-- A post the keeper already has (same LinkedIn URN) is the same post scraped
-- twice. Move its comments onto the keeper's copy so nothing is orphaned, then
-- drop the redundant post row.
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

-- Everything the keeper does NOT already have moves across intact, comments included.
UPDATE public.engagement_posts p
SET target_id = m.keeper_id
FROM target_merge_map m
WHERE p.target_id = m.loser_id;

-- Duplicates are now empty of posts; removing them cascades to nothing.
DELETE FROM public.engagement_targets t
USING target_merge_map m
WHERE t.id = m.loser_id;

ALTER TABLE public.engagement_targets
  ADD CONSTRAINT engagement_targets_workspace_publisher_url_key
  UNIQUE (workspace_id, publisher_id, linkedin_url);

-- Supports the stale-`processing` sweep in bulk-enrich-targets.
CREATE INDEX IF NOT EXISTS idx_engagement_targets_enrichment_status
  ON public.engagement_targets(workspace_id, enrichment_status);

COMMIT;
