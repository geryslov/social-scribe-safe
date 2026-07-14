-- engagement_targets never got the UNIQUE(workspace_id, publisher_id, linkedin_url)
-- constraint: two CREATE TABLE migrations exist and the one that applied omitted it.
-- Duplicate contacts have been accumulating on every re-import. Collapse them
-- (keeping the oldest row per URL, preferring one that actually enriched), then
-- add the constraint so bulk import can upsert instead of insert-and-pray.

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY workspace_id, publisher_id, linkedin_url
      ORDER BY (enrichment_status = 'succeeded') DESC, created_at ASC
    ) AS rn
  FROM public.engagement_targets
)
DELETE FROM public.engagement_targets t
USING ranked r
WHERE t.id = r.id AND r.rn > 1;

ALTER TABLE public.engagement_targets
  ADD CONSTRAINT engagement_targets_workspace_publisher_url_key
  UNIQUE (workspace_id, publisher_id, linkedin_url);

-- Supports the stale-`processing` sweep in bulk-enrich-targets.
CREATE INDEX IF NOT EXISTS idx_engagement_targets_enrichment_status
  ON public.engagement_targets(workspace_id, enrichment_status);
