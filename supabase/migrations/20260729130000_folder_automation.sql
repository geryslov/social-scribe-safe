-- =============================================================================
-- Folder-level automation settings.
--
-- A folder now carries its own Auto-Like / Auto-Sync configuration. Toggling a
-- folder's setting cascades to the targets in it (done in the client hook), and
-- profiles added to or moved into a folder inherit the folder's settings.
--
-- The like/sync engines still read engagement_targets.auto_like / auto_sync —
-- these columns are the folder's default/source-of-truth that cascades down.
-- =============================================================================

ALTER TABLE public.engagement_folders
  ADD COLUMN IF NOT EXISTS auto_like BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_sync BOOLEAN NOT NULL DEFAULT true;
