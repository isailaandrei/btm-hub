-- Admin AI hybrid memory Phase 1 foundation.
--
-- This migration widens the evidence surface and makes mutable CRM evidence
-- append-only:
--
--   1. Add new chunk source types for synthetic structured application fields
--      and canonical CRM tags.
--   2. Add `logical_source_id` so multiple observed versions of the same
--      mutable source slot can coexist.
--   3. Add `superseded_at` so answer-time retrieval can default to "current"
--      evidence while preserving older observations for timeline/conflict use.
--   4. Update retrieval SQL to ignore superseded rows by default.

-- ---------------------------------------------------------------------------
-- Evidence chunk schema
-- ---------------------------------------------------------------------------

ALTER TABLE crm_ai_evidence_chunks
  ADD COLUMN IF NOT EXISTS logical_source_id text,
  ADD COLUMN IF NOT EXISTS superseded_at timestamptz;

UPDATE crm_ai_evidence_chunks
SET logical_source_id = source_id
WHERE logical_source_id IS NULL;

ALTER TABLE crm_ai_evidence_chunks
  ALTER COLUMN logical_source_id SET NOT NULL;

ALTER TABLE crm_ai_evidence_chunks
  DROP CONSTRAINT IF EXISTS crm_ai_evidence_chunks_source_type_check;

ALTER TABLE crm_ai_evidence_chunks
  ADD CONSTRAINT crm_ai_evidence_chunks_source_type_check
  CHECK (
    source_type IN (
      'application_answer',
      'application_structured_field',
      'contact_note',
      'contact_tag',
      'application_admin_note',
      'whatsapp_message',
      'instagram_message',
      'zoom_transcript_chunk'
    )
  );

CREATE INDEX IF NOT EXISTS idx_crm_ai_evidence_chunks_contact_logical
  ON crm_ai_evidence_chunks (contact_id, logical_source_id);

CREATE INDEX IF NOT EXISTS idx_crm_ai_evidence_chunks_current_contact_time
  ON crm_ai_evidence_chunks (contact_id, source_timestamp DESC NULLS LAST)
  WHERE superseded_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_crm_ai_evidence_chunks_current_logical
  ON crm_ai_evidence_chunks (
    contact_id,
    logical_source_id,
    source_timestamp DESC NULLS LAST
  )
  WHERE superseded_at IS NULL;

COMMENT ON COLUMN crm_ai_evidence_chunks.logical_source_id
  IS 'Stable conceptual source slot (for example application field or tag assignment) shared by all observed versions of that source.';

COMMENT ON COLUMN crm_ai_evidence_chunks.superseded_at
  IS 'When non-null, this evidence row is historical and should be excluded from default answer-time retrieval.';

-- ---------------------------------------------------------------------------
-- Current-only chunk retrieval
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION search_admin_ai_chunk_evidence(
  p_query text,
  p_contact_ids uuid[] DEFAULT NULL,
  p_contact_id uuid DEFAULT NULL,
  p_limit int DEFAULT 40
)
RETURNS TABLE (
  evidence_id text,
  contact_id uuid,
  application_id uuid,
  source_type text,
  source_id text,
  source_label text,
  source_timestamp timestamptz,
  program text,
  text text
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_tsquery tsquery;
  v_effective_limit int := GREATEST(COALESCE(p_limit, 40), 1);
  v_has_query boolean := p_query IS NOT NULL AND btrim(p_query) <> '';
BEGIN
  IF v_has_query THEN
    v_tsquery := websearch_to_tsquery('english', p_query);
  END IF;

  IF v_has_query AND v_tsquery IS NOT NULL AND v_tsquery::text <> '' THEN
    RETURN QUERY
    SELECT
      chunk.id::text AS evidence_id,
      chunk.contact_id,
      chunk.application_id,
      chunk.source_type,
      chunk.source_id,
      COALESCE(
        NULLIF(chunk.metadata_json ->> 'sourceLabel', ''),
        chunk.source_type
      ) AS source_label,
      chunk.source_timestamp,
      NULLIF(chunk.metadata_json ->> 'program', '') AS program,
      chunk.text
    FROM crm_ai_evidence_chunks chunk
    WHERE chunk.superseded_at IS NULL
      AND to_tsvector('english', chunk.text) @@ v_tsquery
      AND (
        (p_contact_id IS NOT NULL AND chunk.contact_id = p_contact_id)
        OR (p_contact_id IS NULL AND (
              p_contact_ids IS NULL
              OR array_length(p_contact_ids, 1) IS NULL
              OR chunk.contact_id = ANY(p_contact_ids)
            ))
      )
    ORDER BY
      ts_rank_cd(to_tsvector('english', chunk.text), v_tsquery) DESC,
      chunk.source_timestamp DESC NULLS LAST,
      chunk.updated_at DESC
    LIMIT v_effective_limit;
  ELSIF v_has_query THEN
    RETURN QUERY
    SELECT
      chunk.id::text AS evidence_id,
      chunk.contact_id,
      chunk.application_id,
      chunk.source_type,
      chunk.source_id,
      COALESCE(
        NULLIF(chunk.metadata_json ->> 'sourceLabel', ''),
        chunk.source_type
      ) AS source_label,
      chunk.source_timestamp,
      NULLIF(chunk.metadata_json ->> 'program', '') AS program,
      chunk.text
    FROM crm_ai_evidence_chunks chunk
    WHERE chunk.superseded_at IS NULL
      AND chunk.text ILIKE '%' || p_query || '%'
      AND (
        (p_contact_id IS NOT NULL AND chunk.contact_id = p_contact_id)
        OR (p_contact_id IS NULL AND (
              p_contact_ids IS NULL
              OR array_length(p_contact_ids, 1) IS NULL
              OR chunk.contact_id = ANY(p_contact_ids)
            ))
      )
    ORDER BY chunk.source_timestamp DESC NULLS LAST, chunk.updated_at DESC
    LIMIT v_effective_limit;
  ELSE
    RETURN QUERY
    SELECT
      chunk.id::text AS evidence_id,
      chunk.contact_id,
      chunk.application_id,
      chunk.source_type,
      chunk.source_id,
      COALESCE(
        NULLIF(chunk.metadata_json ->> 'sourceLabel', ''),
        chunk.source_type
      ) AS source_label,
      chunk.source_timestamp,
      NULLIF(chunk.metadata_json ->> 'program', '') AS program,
      chunk.text
    FROM crm_ai_evidence_chunks chunk
    WHERE chunk.superseded_at IS NULL
      AND (
        (p_contact_id IS NOT NULL AND chunk.contact_id = p_contact_id)
        OR (p_contact_id IS NULL AND (
            p_contact_ids IS NULL
            OR array_length(p_contact_ids, 1) IS NULL
            OR chunk.contact_id = ANY(p_contact_ids)
          ))
      )
    ORDER BY chunk.source_timestamp DESC NULLS LAST, chunk.updated_at DESC
    LIMIT v_effective_limit;
  END IF;
END;
$$;

ALTER FUNCTION search_admin_ai_chunk_evidence(text, uuid[], uuid, int)
  SECURITY INVOKER;

COMMENT ON FUNCTION search_admin_ai_chunk_evidence(text, uuid[], uuid, int)
  IS 'Admin AI keyword / FTS retrieval over current crm_ai_evidence_chunks rows (superseded rows excluded by default). SECURITY INVOKER so caller RLS remains authoritative.';

-- ---------------------------------------------------------------------------
-- Stale memory discovery should only consider current evidence rows.
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
    SELECT chunk.contact_id
    FROM crm_ai_evidence_chunks chunk
    WHERE chunk.superseded_at IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM crm_ai_contact_dossiers dossier
        WHERE dossier.contact_id = chunk.contact_id
      )

    UNION

    SELECT dossier.contact_id
    FROM crm_ai_contact_dossiers dossier
    WHERE dossier.stale_at IS NOT NULL AND dossier.stale_at <= now()
  ) c
  LIMIT GREATEST(COALESCE(p_limit, 100), 1);
$$;

GRANT EXECUTE ON FUNCTION search_admin_ai_chunk_evidence(text, uuid[], uuid, int)
  TO authenticated;

GRANT EXECUTE ON FUNCTION find_stale_admin_ai_contact_memory(int)
  TO authenticated;
