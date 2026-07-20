-- Denormalize each contact's latest application submission time so the admin
-- /contacts list can sort by "most recently submitted" natively (indexed),
-- instead of aggregating over applications on every load. Takes over the sort
-- role of the dropped contact_activity_summary view (20260719000001).

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS last_application_at timestamptz;

-- Backfill.
UPDATE contacts c
SET last_application_at = sub.max_submitted
FROM (
  SELECT contact_id, max(submitted_at) AS max_submitted
  FROM applications
  WHERE contact_id IS NOT NULL
  GROUP BY contact_id
) sub
WHERE sub.contact_id = c.id;

CREATE INDEX IF NOT EXISTS idx_contacts_last_application_at
  ON contacts (last_application_at DESC NULLS LAST);

-- Recompute last_application_at for a set of affected contacts.
CREATE OR REPLACE FUNCTION recompute_contacts_last_application_at(p_contact_ids uuid[])
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_contact_ids IS NULL OR array_length(p_contact_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  UPDATE contacts c
  SET last_application_at = sub.max_submitted
  FROM (
    SELECT c2.id AS contact_id,
           (SELECT max(a.submitted_at)
              FROM applications a
             WHERE a.contact_id = c2.id) AS max_submitted
    FROM contacts c2
    WHERE c2.id = ANY(p_contact_ids)
  ) sub
  WHERE sub.contact_id = c.id
    AND c.last_application_at IS DISTINCT FROM sub.max_submitted;
END;
$$;

-- Statement-level trigger: collect affected contact_ids (both old and new on
-- UPDATE, to cover submitted_at edits AND contact_id reassignment) and recompute.
CREATE OR REPLACE FUNCTION trg_contacts_last_application_at_from_applications_stmt()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_contact_ids uuid[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT array_agg(DISTINCT contact_id) INTO v_contact_ids
    FROM new_rows WHERE contact_id IS NOT NULL;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT array_agg(DISTINCT contact_id) INTO v_contact_ids
    FROM old_rows WHERE contact_id IS NOT NULL;
  ELSE
    SELECT array_agg(DISTINCT contact_id) INTO v_contact_ids
    FROM (
      SELECT contact_id FROM new_rows WHERE contact_id IS NOT NULL
      UNION
      SELECT contact_id FROM old_rows WHERE contact_id IS NOT NULL
    ) ids;
  END IF;

  PERFORM recompute_contacts_last_application_at(v_contact_ids);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS applications_contacts_last_application_at_insert_trg ON applications;
DROP TRIGGER IF EXISTS applications_contacts_last_application_at_update_trg ON applications;
DROP TRIGGER IF EXISTS applications_contacts_last_application_at_delete_trg ON applications;

CREATE TRIGGER applications_contacts_last_application_at_insert_trg
  AFTER INSERT ON applications
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION trg_contacts_last_application_at_from_applications_stmt();

CREATE TRIGGER applications_contacts_last_application_at_update_trg
  AFTER UPDATE ON applications
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION trg_contacts_last_application_at_from_applications_stmt();

CREATE TRIGGER applications_contacts_last_application_at_delete_trg
  AFTER DELETE ON applications
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION trg_contacts_last_application_at_from_applications_stmt();
