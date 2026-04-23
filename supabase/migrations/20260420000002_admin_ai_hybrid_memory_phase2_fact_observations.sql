-- ---------------------------------------------------------------------------
-- Admin AI hybrid memory — Phase 2
--
-- Adds an append-only fact ledger for direct structured-field and tag
-- observations. Reruns stay idempotent because the app generates stable
-- observation ids from the chunk version + normalized value, while newer
-- chunk versions append new rows instead of overwriting old ones.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS crm_ai_fact_observations (
  id uuid PRIMARY KEY,
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  observation_type text NOT NULL,
  field_key text,
  value_type text NOT NULL,
  value_text text NOT NULL,
  value_json jsonb NOT NULL DEFAULT 'null'::jsonb,
  confidence text NOT NULL DEFAULT 'high',
  source_chunk_ids uuid[] NOT NULL DEFAULT '{}',
  source_timestamp timestamptz,
  observed_at timestamptz NOT NULL,
  invalidated_at timestamptz,
  conflict_group text,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT crm_ai_fact_observations_observation_type_check CHECK (
    observation_type IN ('application_field', 'contact_tag')
  ),
  CONSTRAINT crm_ai_fact_observations_value_type_check CHECK (
    value_type IN ('string', 'number', 'boolean', 'multiselect', 'json', 'tag')
  ),
  CONSTRAINT crm_ai_fact_observations_confidence_check CHECK (
    confidence IN ('high', 'medium', 'low')
  ),
  CONSTRAINT crm_ai_fact_observations_value_text_not_blank CHECK (
    btrim(value_text) <> ''
  )
);

CREATE INDEX IF NOT EXISTS idx_crm_ai_fact_observations_contact_created
  ON crm_ai_fact_observations (contact_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_ai_fact_observations_contact_field
  ON crm_ai_fact_observations (contact_id, field_key);

CREATE INDEX IF NOT EXISTS idx_crm_ai_fact_observations_contact_type
  ON crm_ai_fact_observations (contact_id, observation_type);

CREATE INDEX IF NOT EXISTS idx_crm_ai_fact_observations_source_chunks
  ON crm_ai_fact_observations USING GIN (source_chunk_ids);

COMMENT ON TABLE crm_ai_fact_observations
  IS 'Append-only Admin AI fact ledger. Direct field and tag observations link back to canonical crm_ai_evidence_chunks ids and accumulate over time.';

COMMENT ON COLUMN crm_ai_fact_observations.source_chunk_ids
  IS 'Canonical crm_ai_evidence_chunks ids supporting this observation.';

COMMENT ON COLUMN crm_ai_fact_observations.conflict_group
  IS 'Optional grouping key for comparable observations, e.g. application_field:budget.';

ALTER TABLE crm_ai_fact_observations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read fact observations" ON crm_ai_fact_observations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can write fact observations" ON crm_ai_fact_observations
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

GRANT SELECT, INSERT, UPDATE, DELETE ON crm_ai_fact_observations TO authenticated;
