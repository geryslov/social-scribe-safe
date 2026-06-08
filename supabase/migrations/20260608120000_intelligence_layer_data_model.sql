-- =============================================================================
-- Intelligence Layer — Data Model
-- Adds research intelligence pipeline tables for the social-scribe-safe platform.
-- All tables are workspace-scoped (workspace_id NOT NULL) and follow existing
-- RLS patterns via user_has_workspace_access() / user_can_create_in_workspace().
-- =============================================================================

-- Ensure pgcrypto is available (for gen_random_uuid, already used elsewhere)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- 1. workspace_research_settings
--    Per-workspace config: schedule frequency, feature toggle.
-- -----------------------------------------------------------------------------
CREATE TABLE public.workspace_research_settings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,

  schedule_frequency TEXT NOT NULL DEFAULT 'daily'
    CHECK (schedule_frequency IN ('daily', 'twice_daily')),
  schedule_enabled   BOOLEAN NOT NULL DEFAULT false,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(workspace_id)
);

-- -----------------------------------------------------------------------------
-- 2. monitoring_topics
--    Per-publisher research topics (company, product, category keywords).
-- -----------------------------------------------------------------------------
CREATE TABLE public.monitoring_topics (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  publisher_id UUID NOT NULL REFERENCES public.publishers(id) ON DELETE CASCADE,

  topic_type   TEXT NOT NULL CHECK (topic_type IN ('company', 'product', 'category')),
  topic_value  TEXT NOT NULL,
  is_active    BOOLEAN NOT NULL DEFAULT true,

  created_by   UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 3. workspace_api_keys
--    Per-workspace API keys for external data sources (Brave, etc.).
--    Keys are stored encrypted — encrypt/decrypt handled via Edge Functions
--    using a server-side secret. RLS prevents cross-workspace access.
-- -----------------------------------------------------------------------------
CREATE TABLE public.workspace_api_keys (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,

  service_name   TEXT NOT NULL,
  api_key_encrypted TEXT NOT NULL,
  key_hint       TEXT,  -- last 4 chars for display, e.g. "...a1b2"

  is_valid         BOOLEAN DEFAULT true,
  last_validated_at TIMESTAMPTZ,

  created_by     UUID REFERENCES auth.users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(workspace_id, service_name)
);

-- -----------------------------------------------------------------------------
-- 4. research_runs
--    Tracks each research execution — scheduled or manual.
-- -----------------------------------------------------------------------------
CREATE TABLE public.research_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  publisher_id  UUID NOT NULL REFERENCES public.publishers(id) ON DELETE CASCADE,

  status        TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  trigger_type  TEXT NOT NULL DEFAULT 'manual'
    CHECK (trigger_type IN ('scheduled', 'manual')),

  sources_used     TEXT[] DEFAULT '{}',
  topics_searched  TEXT[] DEFAULT '{}',
  items_found      INTEGER DEFAULT 0,

  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  error_message TEXT,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 5. intelligence_items
--    Individual research results — the core feed data.
--    Deduplicated per workspace by URL.
-- -----------------------------------------------------------------------------
CREATE TABLE public.intelligence_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  publisher_id    UUID NOT NULL REFERENCES public.publishers(id) ON DELETE CASCADE,
  research_run_id UUID REFERENCES public.research_runs(id) ON DELETE SET NULL,
  topic_id        UUID REFERENCES public.monitoring_topics(id) ON DELETE SET NULL,

  -- Source info
  source_type     TEXT NOT NULL CHECK (source_type IN ('reddit', 'hackernews', 'web')),
  title           TEXT NOT NULL,
  url             TEXT NOT NULL,
  content_snippet TEXT,
  author          TEXT,
  published_at    TIMESTAMPTZ,

  -- Engagement signals
  engagement_score INTEGER DEFAULT 0,  -- normalized composite for ranking
  upvotes          INTEGER DEFAULT 0,
  comments_count   INTEGER DEFAULT 0,
  views            INTEGER DEFAULT 0,
  points           INTEGER DEFAULT 0,  -- HN points

  -- Flexible platform-specific metadata
  source_metadata  JSONB DEFAULT '{}',

  -- Document bridge (FR25)
  is_used_in_document BOOLEAN NOT NULL DEFAULT false,
  used_in_document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Dedup: same URL not stored twice per workspace (FR14)
  UNIQUE(workspace_id, url)
);


-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE public.workspace_research_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitoring_topics            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_api_keys           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_runs                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_items           ENABLE ROW LEVEL SECURITY;

-- ---- workspace_research_settings ----

CREATE POLICY "Users can view research settings in their workspaces"
ON public.workspace_research_settings FOR SELECT TO authenticated
USING (public.user_has_workspace_access(workspace_id));

CREATE POLICY "Workspace admins can insert research settings"
ON public.workspace_research_settings FOR INSERT TO authenticated
WITH CHECK (public.user_can_create_in_workspace(workspace_id));

CREATE POLICY "Workspace admins can update research settings"
ON public.workspace_research_settings FOR UPDATE TO authenticated
USING (public.user_can_create_in_workspace(workspace_id))
WITH CHECK (public.user_can_create_in_workspace(workspace_id));

-- ---- monitoring_topics ----

CREATE POLICY "Users can view topics in their workspaces"
ON public.monitoring_topics FOR SELECT TO authenticated
USING (public.user_has_workspace_access(workspace_id));

CREATE POLICY "Workspace admins can create topics"
ON public.monitoring_topics FOR INSERT TO authenticated
WITH CHECK (public.user_can_create_in_workspace(workspace_id));

CREATE POLICY "Workspace admins can update topics"
ON public.monitoring_topics FOR UPDATE TO authenticated
USING (public.user_can_create_in_workspace(workspace_id))
WITH CHECK (public.user_can_create_in_workspace(workspace_id));

CREATE POLICY "Workspace admins can delete topics"
ON public.monitoring_topics FOR DELETE TO authenticated
USING (public.user_can_create_in_workspace(workspace_id));

-- ---- workspace_api_keys ----
-- Only admins can see/manage keys. Members cannot access at all.

CREATE POLICY "Workspace admins can view api keys"
ON public.workspace_api_keys FOR SELECT TO authenticated
USING (public.user_can_create_in_workspace(workspace_id));

CREATE POLICY "Workspace admins can insert api keys"
ON public.workspace_api_keys FOR INSERT TO authenticated
WITH CHECK (public.user_can_create_in_workspace(workspace_id));

CREATE POLICY "Workspace admins can update api keys"
ON public.workspace_api_keys FOR UPDATE TO authenticated
USING (public.user_can_create_in_workspace(workspace_id))
WITH CHECK (public.user_can_create_in_workspace(workspace_id));

CREATE POLICY "Workspace admins can delete api keys"
ON public.workspace_api_keys FOR DELETE TO authenticated
USING (public.user_can_create_in_workspace(workspace_id));

-- ---- research_runs ----

CREATE POLICY "Users can view research runs in their workspaces"
ON public.research_runs FOR SELECT TO authenticated
USING (public.user_has_workspace_access(workspace_id));

CREATE POLICY "Workspace admins can create research runs"
ON public.research_runs FOR INSERT TO authenticated
WITH CHECK (public.user_can_create_in_workspace(workspace_id));

CREATE POLICY "Workspace admins can update research runs"
ON public.research_runs FOR UPDATE TO authenticated
USING (public.user_can_create_in_workspace(workspace_id))
WITH CHECK (public.user_can_create_in_workspace(workspace_id));

-- ---- intelligence_items ----
-- All workspace members can READ (publishers get read-only feed per FR17).
-- Only admins/creators can INSERT (Edge Functions run as service role anyway).
-- Only admins can UPDATE (marking items as used in documents).

CREATE POLICY "Users can view intelligence items in their workspaces"
ON public.intelligence_items FOR SELECT TO authenticated
USING (public.user_has_workspace_access(workspace_id));

CREATE POLICY "Workspace admins can create intelligence items"
ON public.intelligence_items FOR INSERT TO authenticated
WITH CHECK (public.user_can_create_in_workspace(workspace_id));

CREATE POLICY "Workspace admins can update intelligence items"
ON public.intelligence_items FOR UPDATE TO authenticated
USING (public.user_can_create_in_workspace(workspace_id))
WITH CHECK (public.user_can_create_in_workspace(workspace_id));


-- =============================================================================
-- INDEXES
-- =============================================================================

-- monitoring_topics
CREATE INDEX idx_monitoring_topics_workspace    ON public.monitoring_topics(workspace_id);
CREATE INDEX idx_monitoring_topics_publisher    ON public.monitoring_topics(publisher_id);
CREATE INDEX idx_monitoring_topics_active       ON public.monitoring_topics(workspace_id, is_active) WHERE is_active = true;

-- workspace_api_keys
CREATE INDEX idx_workspace_api_keys_workspace   ON public.workspace_api_keys(workspace_id);

-- research_runs
CREATE INDEX idx_research_runs_workspace        ON public.research_runs(workspace_id);
CREATE INDEX idx_research_runs_publisher        ON public.research_runs(publisher_id);
CREATE INDEX idx_research_runs_status           ON public.research_runs(workspace_id, status);
CREATE INDEX idx_research_runs_created          ON public.research_runs(workspace_id, created_at DESC);

-- intelligence_items — optimized for feed queries (FR18: engagement-ranked)
CREATE INDEX idx_intelligence_items_workspace   ON public.intelligence_items(workspace_id);
CREATE INDEX idx_intelligence_items_publisher   ON public.intelligence_items(publisher_id);
CREATE INDEX idx_intelligence_items_feed        ON public.intelligence_items(workspace_id, publisher_id, engagement_score DESC);
CREATE INDEX idx_intelligence_items_source      ON public.intelligence_items(workspace_id, publisher_id, source_type);
CREATE INDEX idx_intelligence_items_topic       ON public.intelligence_items(topic_id);
CREATE INDEX idx_intelligence_items_created     ON public.intelligence_items(workspace_id, publisher_id, created_at DESC);
CREATE INDEX idx_intelligence_items_unused      ON public.intelligence_items(workspace_id, publisher_id, is_used_in_document) WHERE is_used_in_document = false;


-- =============================================================================
-- TRIGGERS — updated_at auto-update
-- =============================================================================
-- Reuses the existing update_updated_at_column() trigger function.

CREATE TRIGGER update_workspace_research_settings_updated_at
  BEFORE UPDATE ON public.workspace_research_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_monitoring_topics_updated_at
  BEFORE UPDATE ON public.monitoring_topics
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_workspace_api_keys_updated_at
  BEFORE UPDATE ON public.workspace_api_keys
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- =============================================================================
-- COMMENTS — table-level documentation
-- =============================================================================

COMMENT ON TABLE public.workspace_research_settings IS 'Per-workspace intelligence research configuration (schedule, feature toggle)';
COMMENT ON TABLE public.monitoring_topics IS 'Per-publisher research topics — company, product, and category keywords to monitor';
COMMENT ON TABLE public.workspace_api_keys IS 'Per-workspace API keys for external research sources (Brave, ScrapeCreators, etc.). Keys encrypted at application layer.';
COMMENT ON TABLE public.research_runs IS 'Tracks each research execution — status, sources, results count, timing';
COMMENT ON TABLE public.intelligence_items IS 'Individual research results — the intelligence feed. Deduplicated per workspace by URL.';
