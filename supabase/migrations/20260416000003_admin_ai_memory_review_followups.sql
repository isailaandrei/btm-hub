-- Admin AI memory follow-up hardening from implementation review.
--
-- This migration:
--   1. Drops the dead pre-memory evidence view / RPC so there is only one
--      canonical answer-time evidence surface (`crm_ai_evidence_chunks`).
--   2. Makes the chunk-search RPC's SECURITY INVOKER stance explicit.
--   3. Replaces row-level stale-marking triggers on hot write tables with
--      statement-level triggers using transition tables to avoid N UPDATEs
--      during bulk tag / application / note operations.

-- ---------------------------------------------------------------------------
-- Remove dead legacy evidence surfaces
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS search_admin_ai_evidence(text, uuid[], uuid, int);
DROP VIEW IF EXISTS admin_ai_evidence_items;

-- ---------------------------------------------------------------------------
-- Make chunk-search security explicit
-- ---------------------------------------------------------------------------

ALTER FUNCTION search_admin_ai_chunk_evidence(text, uuid[], uuid, int)
  SECURITY INVOKER;

COMMENT ON FUNCTION search_admin_ai_chunk_evidence(text, uuid[], uuid, int)
  IS 'Admin AI keyword / FTS retrieval over crm_ai_evidence_chunks. SECURITY INVOKER so caller RLS remains authoritative.';

-- ---------------------------------------------------------------------------
-- Bulk stale-marking helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION mark_admin_ai_contact_memory_stale_set(
  p_contact_ids uuid[]
)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE crm_ai_contact_dossiers dossier
  SET stale_at = COALESCE(dossier.stale_at, now())
  WHERE dossier.contact_id = ANY(COALESCE(p_contact_ids, ARRAY[]::uuid[]));
$$;

CREATE OR REPLACE FUNCTION trg_mark_admin_ai_memory_stale_from_applications_stmt()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_contact_ids uuid[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT array_agg(DISTINCT contact_id)
    INTO v_contact_ids
    FROM new_rows
    WHERE contact_id IS NOT NULL;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT array_agg(DISTINCT contact_id)
    INTO v_contact_ids
    FROM old_rows
    WHERE contact_id IS NOT NULL;
  ELSE
    SELECT array_agg(DISTINCT contact_id)
    INTO v_contact_ids
    FROM (
      SELECT contact_id FROM new_rows WHERE contact_id IS NOT NULL
      UNION
      SELECT contact_id FROM old_rows WHERE contact_id IS NOT NULL
    ) ids;
  END IF;

  PERFORM mark_admin_ai_contact_memory_stale_set(v_contact_ids);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION trg_mark_admin_ai_memory_stale_from_contact_notes_stmt()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_contact_ids uuid[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT array_agg(DISTINCT contact_id)
    INTO v_contact_ids
    FROM new_rows
    WHERE contact_id IS NOT NULL;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT array_agg(DISTINCT contact_id)
    INTO v_contact_ids
    FROM old_rows
    WHERE contact_id IS NOT NULL;
  ELSE
    SELECT array_agg(DISTINCT contact_id)
    INTO v_contact_ids
    FROM (
      SELECT contact_id FROM new_rows WHERE contact_id IS NOT NULL
      UNION
      SELECT contact_id FROM old_rows WHERE contact_id IS NOT NULL
    ) ids;
  END IF;

  PERFORM mark_admin_ai_contact_memory_stale_set(v_contact_ids);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION trg_mark_admin_ai_memory_stale_from_contact_tags_stmt()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_contact_ids uuid[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT array_agg(DISTINCT contact_id)
    INTO v_contact_ids
    FROM new_rows
    WHERE contact_id IS NOT NULL;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT array_agg(DISTINCT contact_id)
    INTO v_contact_ids
    FROM old_rows
    WHERE contact_id IS NOT NULL;
  ELSE
    SELECT array_agg(DISTINCT contact_id)
    INTO v_contact_ids
    FROM (
      SELECT contact_id FROM new_rows WHERE contact_id IS NOT NULL
      UNION
      SELECT contact_id FROM old_rows WHERE contact_id IS NOT NULL
    ) ids;
  END IF;

  PERFORM mark_admin_ai_contact_memory_stale_set(v_contact_ids);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION trg_mark_admin_ai_memory_stale_from_contacts_stmt()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_contact_ids uuid[];
BEGIN
  SELECT array_agg(DISTINCT id)
  INTO v_contact_ids
  FROM new_rows
  WHERE id IS NOT NULL;

  PERFORM mark_admin_ai_contact_memory_stale_set(v_contact_ids);
  RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------------
-- Replace row-level stale triggers on hot write tables
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS applications_mark_admin_ai_memory_stale_trg
  ON applications;
DROP TRIGGER IF EXISTS applications_mark_admin_ai_memory_stale_insert_trg
  ON applications;
DROP TRIGGER IF EXISTS applications_mark_admin_ai_memory_stale_update_trg
  ON applications;
DROP TRIGGER IF EXISTS applications_mark_admin_ai_memory_stale_delete_trg
  ON applications;

CREATE TRIGGER applications_mark_admin_ai_memory_stale_insert_trg
  AFTER INSERT ON applications
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION trg_mark_admin_ai_memory_stale_from_applications_stmt();

CREATE TRIGGER applications_mark_admin_ai_memory_stale_update_trg
  AFTER UPDATE ON applications
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION trg_mark_admin_ai_memory_stale_from_applications_stmt();

CREATE TRIGGER applications_mark_admin_ai_memory_stale_delete_trg
  AFTER DELETE ON applications
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION trg_mark_admin_ai_memory_stale_from_applications_stmt();

DROP TRIGGER IF EXISTS contact_notes_mark_admin_ai_memory_stale_trg
  ON contact_notes;
DROP TRIGGER IF EXISTS contact_notes_mark_admin_ai_memory_stale_insert_trg
  ON contact_notes;
DROP TRIGGER IF EXISTS contact_notes_mark_admin_ai_memory_stale_update_trg
  ON contact_notes;
DROP TRIGGER IF EXISTS contact_notes_mark_admin_ai_memory_stale_delete_trg
  ON contact_notes;

CREATE TRIGGER contact_notes_mark_admin_ai_memory_stale_insert_trg
  AFTER INSERT ON contact_notes
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION trg_mark_admin_ai_memory_stale_from_contact_notes_stmt();

CREATE TRIGGER contact_notes_mark_admin_ai_memory_stale_update_trg
  AFTER UPDATE ON contact_notes
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION trg_mark_admin_ai_memory_stale_from_contact_notes_stmt();

CREATE TRIGGER contact_notes_mark_admin_ai_memory_stale_delete_trg
  AFTER DELETE ON contact_notes
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION trg_mark_admin_ai_memory_stale_from_contact_notes_stmt();

DROP TRIGGER IF EXISTS contact_tags_mark_admin_ai_memory_stale_trg
  ON contact_tags;
DROP TRIGGER IF EXISTS contact_tags_mark_admin_ai_memory_stale_insert_trg
  ON contact_tags;
DROP TRIGGER IF EXISTS contact_tags_mark_admin_ai_memory_stale_update_trg
  ON contact_tags;
DROP TRIGGER IF EXISTS contact_tags_mark_admin_ai_memory_stale_delete_trg
  ON contact_tags;

CREATE TRIGGER contact_tags_mark_admin_ai_memory_stale_insert_trg
  AFTER INSERT ON contact_tags
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION trg_mark_admin_ai_memory_stale_from_contact_tags_stmt();

CREATE TRIGGER contact_tags_mark_admin_ai_memory_stale_update_trg
  AFTER UPDATE ON contact_tags
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION trg_mark_admin_ai_memory_stale_from_contact_tags_stmt();

CREATE TRIGGER contact_tags_mark_admin_ai_memory_stale_delete_trg
  AFTER DELETE ON contact_tags
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION trg_mark_admin_ai_memory_stale_from_contact_tags_stmt();

DROP TRIGGER IF EXISTS contacts_mark_admin_ai_memory_stale_trg
  ON contacts;
DROP TRIGGER IF EXISTS contacts_mark_admin_ai_memory_stale_update_trg
  ON contacts;

CREATE TRIGGER contacts_mark_admin_ai_memory_stale_update_trg
  AFTER UPDATE ON contacts
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION trg_mark_admin_ai_memory_stale_from_contacts_stmt();
