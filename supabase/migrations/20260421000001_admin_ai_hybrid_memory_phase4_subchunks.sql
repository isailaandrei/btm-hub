-- ---------------------------------------------------------------------------
-- Admin AI hybrid memory — Phase 4: evidence subchunks + embedding targets
-- ---------------------------------------------------------------------------
--
-- Adds:
--   1. crm_ai_evidence_subchunks — deterministic retrieval units derived from
--      canonical evidence chunks. Oversized free-text chunks can fan out into
--      multiple subchunks with overlap; short structured chunks still get a
--      single retrievable row.
--   2. crm_ai_embeddings target_type widening so vectors can point at
--      subchunks directly.

-- Widen embedding target types to include subchunks.
ALTER TABLE crm_ai_embeddings
  DROP CONSTRAINT IF EXISTS crm_ai_embeddings_target_type_check;

ALTER TABLE crm_ai_embeddings
  ADD CONSTRAINT crm_ai_embeddings_target_type_check
  CHECK (target_type IN ('chunk', 'dossier', 'subchunk'));

-- ---------------------------------------------------------------------------
-- crm_ai_evidence_subchunks
-- ---------------------------------------------------------------------------

CREATE TABLE crm_ai_evidence_subchunks (
  id uuid PRIMARY KEY,
  parent_chunk_id uuid NOT NULL REFERENCES crm_ai_evidence_chunks(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  application_id uuid NULL REFERENCES applications(id) ON DELETE CASCADE,
  subchunk_index integer NOT NULL CHECK (subchunk_index >= 0),
  text text NOT NULL,
  content_hash text NOT NULL,
  token_estimate integer NOT NULL CHECK (token_estimate >= 0),
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_ai_evidence_subchunks_unique_position
    UNIQUE (parent_chunk_id, subchunk_index)
);

CREATE INDEX idx_crm_ai_evidence_subchunks_parent
  ON crm_ai_evidence_subchunks (parent_chunk_id);

CREATE INDEX idx_crm_ai_evidence_subchunks_contact
  ON crm_ai_evidence_subchunks (contact_id);

CREATE INDEX idx_crm_ai_evidence_subchunks_application
  ON crm_ai_evidence_subchunks (application_id);

CREATE OR REPLACE FUNCTION crm_ai_evidence_subchunks_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER crm_ai_evidence_subchunks_set_updated_at_trg
  BEFORE UPDATE ON crm_ai_evidence_subchunks
  FOR EACH ROW
  EXECUTE FUNCTION crm_ai_evidence_subchunks_set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS / grants
-- ---------------------------------------------------------------------------

ALTER TABLE crm_ai_evidence_subchunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read evidence subchunks" ON crm_ai_evidence_subchunks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can write evidence subchunks" ON crm_ai_evidence_subchunks
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

GRANT SELECT, INSERT, UPDATE, DELETE ON crm_ai_evidence_subchunks TO authenticated;
