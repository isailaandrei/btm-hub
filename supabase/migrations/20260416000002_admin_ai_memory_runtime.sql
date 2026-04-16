-- Admin AI memory runtime hardening.
--
-- Builds on the tables + RLS from `20260416000001_admin_ai_memory_foundation.sql`:
--   1. Answer-time evidence retrieval over `crm_ai_evidence_chunks` (the
--      legacy `admin_ai_evidence_items` view stays for audit purposes but
--      is no longer the AI-facing retrieval surface).
--   2. Current CRM source mutations mark dossier memory stale so
--      retrieval-time rebuild-on-read can refresh narrow subsets safely.
--   3. The stale-memory discovery RPC also includes contacts that have a
--      dossier but are missing a ranking card.

-- ---------------------------------------------------------------------------
-- Chunk-backed evidence retrieval
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
    WHERE to_tsvector('english', chunk.text) @@ v_tsquery
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
    WHERE chunk.text ILIKE '%' || p_query || '%'
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
    WHERE (
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

GRANT EXECUTE ON FUNCTION search_admin_ai_chunk_evidence(text, uuid[], uuid, int)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- Stale-marking helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION mark_admin_ai_contact_memory_stale(
  p_contact_id uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_contact_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE crm_ai_contact_dossiers
  SET stale_at = COALESCE(stale_at, now())
  WHERE contact_id = p_contact_id;
END;
$$;

CREATE OR REPLACE FUNCTION mark_admin_ai_contacts_for_tag_stale(
  p_tag_id uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_tag_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE crm_ai_contact_dossiers dossier
  SET stale_at = COALESCE(dossier.stale_at, now())
  WHERE dossier.contact_id IN (
    SELECT contact_id
    FROM contact_tags
    WHERE tag_id = p_tag_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION trg_mark_admin_ai_memory_stale_from_applications()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM mark_admin_ai_contact_memory_stale(OLD.contact_id);
    RETURN NULL;
  END IF;

  PERFORM mark_admin_ai_contact_memory_stale(NEW.contact_id);
  IF TG_OP = 'UPDATE' AND OLD.contact_id IS DISTINCT FROM NEW.contact_id THEN
    PERFORM mark_admin_ai_contact_memory_stale(OLD.contact_id);
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION trg_mark_admin_ai_memory_stale_from_contact_notes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM mark_admin_ai_contact_memory_stale(OLD.contact_id);
    RETURN NULL;
  END IF;

  PERFORM mark_admin_ai_contact_memory_stale(NEW.contact_id);
  IF TG_OP = 'UPDATE' AND OLD.contact_id IS DISTINCT FROM NEW.contact_id THEN
    PERFORM mark_admin_ai_contact_memory_stale(OLD.contact_id);
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION trg_mark_admin_ai_memory_stale_from_contacts()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM mark_admin_ai_contact_memory_stale(NEW.id);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION trg_mark_admin_ai_memory_stale_from_contact_tags()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM mark_admin_ai_contact_memory_stale(OLD.contact_id);
    RETURN NULL;
  END IF;

  PERFORM mark_admin_ai_contact_memory_stale(NEW.contact_id);
  IF TG_OP = 'UPDATE' AND OLD.contact_id IS DISTINCT FROM NEW.contact_id THEN
    PERFORM mark_admin_ai_contact_memory_stale(OLD.contact_id);
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION trg_mark_admin_ai_memory_stale_from_tags()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM mark_admin_ai_contacts_for_tag_stale(OLD.id);
    RETURN NULL;
  END IF;

  PERFORM mark_admin_ai_contacts_for_tag_stale(NEW.id);
  IF TG_OP = 'UPDATE' AND OLD.id IS DISTINCT FROM NEW.id THEN
    PERFORM mark_admin_ai_contacts_for_tag_stale(OLD.id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS applications_mark_admin_ai_memory_stale_trg
  ON applications;
CREATE TRIGGER applications_mark_admin_ai_memory_stale_trg
  AFTER INSERT OR UPDATE OR DELETE ON applications
  FOR EACH ROW
  EXECUTE FUNCTION trg_mark_admin_ai_memory_stale_from_applications();

DROP TRIGGER IF EXISTS contact_notes_mark_admin_ai_memory_stale_trg
  ON contact_notes;
CREATE TRIGGER contact_notes_mark_admin_ai_memory_stale_trg
  AFTER INSERT OR UPDATE OR DELETE ON contact_notes
  FOR EACH ROW
  EXECUTE FUNCTION trg_mark_admin_ai_memory_stale_from_contact_notes();

DROP TRIGGER IF EXISTS contacts_mark_admin_ai_memory_stale_trg
  ON contacts;
CREATE TRIGGER contacts_mark_admin_ai_memory_stale_trg
  AFTER UPDATE ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION trg_mark_admin_ai_memory_stale_from_contacts();

DROP TRIGGER IF EXISTS contact_tags_mark_admin_ai_memory_stale_trg
  ON contact_tags;
CREATE TRIGGER contact_tags_mark_admin_ai_memory_stale_trg
  AFTER INSERT OR UPDATE OR DELETE ON contact_tags
  FOR EACH ROW
  EXECUTE FUNCTION trg_mark_admin_ai_memory_stale_from_contact_tags();

DROP TRIGGER IF EXISTS tags_mark_admin_ai_memory_stale_trg
  ON tags;
CREATE TRIGGER tags_mark_admin_ai_memory_stale_trg
  AFTER UPDATE OR DELETE ON tags
  FOR EACH ROW
  EXECUTE FUNCTION trg_mark_admin_ai_memory_stale_from_tags();

-- ---------------------------------------------------------------------------
-- Stale-memory discovery should also include missing ranking cards
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
    SELECT contact_id
    FROM crm_ai_evidence_chunks chunk
    WHERE NOT EXISTS (
      SELECT 1
      FROM crm_ai_contact_dossiers dossier
      WHERE dossier.contact_id = chunk.contact_id
    )

    UNION

    SELECT contact_id
    FROM crm_ai_contact_dossiers
    WHERE stale_at IS NOT NULL AND stale_at <= now()

    UNION

    SELECT dossier.contact_id
    FROM crm_ai_contact_dossiers dossier
    WHERE NOT EXISTS (
      SELECT 1
      FROM crm_ai_contact_ranking_cards card
      WHERE card.contact_id = dossier.contact_id
    )
  ) c
  LIMIT GREATEST(COALESCE(p_limit, 100), 1);
$$;

GRANT EXECUTE ON FUNCTION find_stale_admin_ai_contact_memory(int) TO authenticated;
