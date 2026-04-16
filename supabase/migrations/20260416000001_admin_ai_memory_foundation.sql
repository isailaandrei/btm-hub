-- Admin AI memory foundation: 5-layer external-memory architecture (Phase 1).
--
-- Adds four new tables that surround (without altering) the existing
-- admin_ai_threads/messages/citations flow:
--
--   1. crm_ai_evidence_chunks    — canonical AI-facing evidence storage,
--                                   source-agnostic across applications,
--                                   contact notes, application admin notes,
--                                   and future message/transcript chunks.
--   2. crm_ai_contact_dossiers   — persistent per-contact AI memory.
--   3. crm_ai_contact_ranking_cards — compact whole-cohort projection of the
--                                   dossier, used by the global ranking pass.
--   4. crm_ai_embeddings         — future-proof embedding storage for chunks
--                                   and (later) dossier summaries. Created
--                                   now but NOT exercised by current
--                                   retrieval (CRM-only path stays FTS +
--                                   memory-first per design).
--
-- Embedding dimension is fixed at 1536 to match OpenAI text-embedding-3-small
-- — the cheapest first-party embedding model that pairs naturally with the
-- existing OpenAI provider in src/lib/admin-ai/provider.ts. If a different
-- model is chosen later, add a new column or table rather than mutating the
-- vector dimension in place (vector(N) is not in-place alterable).

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- crm_ai_evidence_chunks
-- ---------------------------------------------------------------------------

CREATE TABLE crm_ai_evidence_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  application_id uuid REFERENCES applications(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (
    source_type IN (
      'application_answer',
      'contact_note',
      'application_admin_note',
      'whatsapp_message',
      'instagram_message',
      'zoom_transcript_chunk'
    )
  ),
  source_id text NOT NULL,
  source_timestamp timestamptz,
  text text NOT NULL,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  content_hash text NOT NULL,
  chunk_version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_ai_evidence_chunks_text_not_blank CHECK (btrim(text) <> ''),
  CONSTRAINT crm_ai_evidence_chunks_unique_version
    UNIQUE (source_type, source_id, content_hash)
);

CREATE INDEX idx_crm_ai_evidence_chunks_contact_time
  ON crm_ai_evidence_chunks (contact_id, source_timestamp DESC NULLS LAST);

CREATE INDEX idx_crm_ai_evidence_chunks_source_time
  ON crm_ai_evidence_chunks (source_type, source_timestamp DESC NULLS LAST);

CREATE INDEX idx_crm_ai_evidence_chunks_text_fts
  ON crm_ai_evidence_chunks USING GIN (to_tsvector('english', text));

CREATE OR REPLACE FUNCTION crm_ai_evidence_chunks_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER crm_ai_evidence_chunks_set_updated_at_trg
  BEFORE UPDATE ON crm_ai_evidence_chunks
  FOR EACH ROW
  EXECUTE FUNCTION crm_ai_evidence_chunks_set_updated_at();

-- ---------------------------------------------------------------------------
-- crm_ai_contact_dossiers
-- ---------------------------------------------------------------------------

CREATE TABLE crm_ai_contact_dossiers (
  contact_id uuid PRIMARY KEY REFERENCES contacts(id) ON DELETE CASCADE,
  dossier_version int NOT NULL,
  generator_version text NOT NULL,
  source_fingerprint text NOT NULL,
  source_coverage jsonb NOT NULL DEFAULT '{}'::jsonb,
  facts_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  signals_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  contradictions_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  unknowns_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence_anchors_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  short_summary text NOT NULL,
  medium_summary text NOT NULL,
  confidence_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_built_at timestamptz NOT NULL DEFAULT now(),
  stale_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_crm_ai_contact_dossiers_stale_at
  ON crm_ai_contact_dossiers (stale_at)
  WHERE stale_at IS NOT NULL;

CREATE OR REPLACE FUNCTION crm_ai_contact_dossiers_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER crm_ai_contact_dossiers_set_updated_at_trg
  BEFORE UPDATE ON crm_ai_contact_dossiers
  FOR EACH ROW
  EXECUTE FUNCTION crm_ai_contact_dossiers_set_updated_at();

-- ---------------------------------------------------------------------------
-- crm_ai_contact_ranking_cards
-- ---------------------------------------------------------------------------

CREATE TABLE crm_ai_contact_ranking_cards (
  contact_id uuid PRIMARY KEY REFERENCES contacts(id) ON DELETE CASCADE,
  dossier_version int NOT NULL,
  source_fingerprint text NOT NULL,
  facts_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  top_fit_signals_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  top_concerns_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence_notes_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  short_summary text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION crm_ai_contact_ranking_cards_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER crm_ai_contact_ranking_cards_set_updated_at_trg
  BEFORE UPDATE ON crm_ai_contact_ranking_cards
  FOR EACH ROW
  EXECUTE FUNCTION crm_ai_contact_ranking_cards_set_updated_at();

-- ---------------------------------------------------------------------------
-- crm_ai_embeddings (future-scoped — schema only, retrieval not active)
-- ---------------------------------------------------------------------------

CREATE TABLE crm_ai_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type text NOT NULL CHECK (target_type IN ('chunk', 'dossier')),
  target_id uuid NOT NULL,
  embedding_model text NOT NULL,
  embedding_version text NOT NULL,
  content_hash text NOT NULL,
  embedding extensions.vector(1536),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_ai_embeddings_unique_version
    UNIQUE (target_type, target_id, embedding_model, embedding_version, content_hash)
);

CREATE INDEX idx_crm_ai_embeddings_target
  ON crm_ai_embeddings (target_type, target_id);

-- ---------------------------------------------------------------------------
-- RLS — admin-only across all four tables
-- ---------------------------------------------------------------------------

ALTER TABLE crm_ai_evidence_chunks      ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_ai_contact_dossiers     ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_ai_contact_ranking_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_ai_embeddings           ENABLE ROW LEVEL SECURITY;

-- crm_ai_evidence_chunks
CREATE POLICY "Admins can read evidence chunks" ON crm_ai_evidence_chunks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can write evidence chunks" ON crm_ai_evidence_chunks
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- crm_ai_contact_dossiers
CREATE POLICY "Admins can read dossiers" ON crm_ai_contact_dossiers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can write dossiers" ON crm_ai_contact_dossiers
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- crm_ai_contact_ranking_cards
CREATE POLICY "Admins can read ranking cards" ON crm_ai_contact_ranking_cards
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can write ranking cards" ON crm_ai_contact_ranking_cards
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- crm_ai_embeddings
CREATE POLICY "Admins can read embeddings" ON crm_ai_embeddings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can write embeddings" ON crm_ai_embeddings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- ---------------------------------------------------------------------------
-- GRANTs
-- ---------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE, DELETE ON crm_ai_evidence_chunks       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON crm_ai_contact_dossiers      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON crm_ai_contact_ranking_cards TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON crm_ai_embeddings            TO authenticated;

-- ---------------------------------------------------------------------------
-- find_stale_admin_ai_contact_memory
--
-- Returns contact ids that need a memory rebuild:
--   * contacts that have evidence chunks but no dossier row, OR
--   * contacts whose dossier has been marked stale (stale_at IS NOT NULL
--     AND stale_at <= now()).
-- The companion freshness module decides additional staleness signals
-- (fingerprint mismatch, generator version drift) — those checks happen
-- in the application layer because they require comparing live source
-- state against the stored fingerprint.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION find_stale_admin_ai_contact_memory(
  p_limit int DEFAULT 100
)
RETURNS TABLE (contact_id uuid)
LANGUAGE sql
STABLE
AS $$
  SELECT DISTINCT c.contact_id
  FROM (
    SELECT contact_id FROM crm_ai_evidence_chunks
    WHERE NOT EXISTS (
      SELECT 1 FROM crm_ai_contact_dossiers d
      WHERE d.contact_id = crm_ai_evidence_chunks.contact_id
    )
    UNION
    SELECT contact_id FROM crm_ai_contact_dossiers
    WHERE stale_at IS NOT NULL AND stale_at <= now()
  ) c
  LIMIT GREATEST(COALESCE(p_limit, 100), 1);
$$;

GRANT EXECUTE ON FUNCTION find_stale_admin_ai_contact_memory(int) TO authenticated;
