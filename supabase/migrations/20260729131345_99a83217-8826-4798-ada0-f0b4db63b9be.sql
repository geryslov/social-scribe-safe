BEGIN;

UPDATE public.engagement_targets
SET linkedin_username = lower(linkedin_username)
WHERE linkedin_username IS NOT NULL
  AND linkedin_username <> lower(linkedin_username);

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

UPDATE public.engagement_posts p
SET target_id = m.keeper_id
FROM target_merge_map m
WHERE p.target_id = m.loser_id;

DELETE FROM public.engagement_targets t
USING target_merge_map m
WHERE t.id = m.loser_id;

ALTER TABLE public.engagement_targets
  ADD CONSTRAINT engagement_targets_workspace_publisher_username_key
  UNIQUE (workspace_id, publisher_id, linkedin_username);

CREATE INDEX IF NOT EXISTS idx_engagement_targets_enrichment_status
  ON public.engagement_targets(workspace_id, enrichment_status);

COMMIT;