ALTER TABLE tag_categories
  ADD COLUMN updated_at timestamptz DEFAULT now() NOT NULL;

ALTER TABLE tags
  ADD COLUMN updated_at timestamptz DEFAULT now() NOT NULL;

CREATE OR REPLACE FUNCTION bulk_assign_contact_tags(
  p_contact_ids uuid[],
  p_tag_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  requested_count integer := COALESCE(array_length(p_contact_ids, 1), 0);
  existing_count integer := 0;
  inserted_count integer := 0;
BEGIN
  WITH deduped_ids AS (
    SELECT DISTINCT contact_id
    FROM unnest(COALESCE(p_contact_ids, ARRAY[]::uuid[])) AS contact_id
  ),
  existing_contacts AS (
    SELECT d.contact_id
    FROM deduped_ids d
    INNER JOIN contacts c ON c.id = d.contact_id
  ),
  inserted_rows AS (
    INSERT INTO contact_tags (contact_id, tag_id)
    SELECT e.contact_id, p_tag_id
    FROM existing_contacts e
    ON CONFLICT (contact_id, tag_id) DO NOTHING
    RETURNING contact_id
  )
  SELECT
    (SELECT count(*) FROM existing_contacts),
    (SELECT count(*) FROM inserted_rows)
  INTO existing_count, inserted_count;

  RETURN jsonb_build_object(
    'requested', requested_count,
    'existing', existing_count,
    'inserted', inserted_count,
    'already_assigned', GREATEST(existing_count - inserted_count, 0),
    'skipped_missing', GREATEST(requested_count - existing_count, 0)
  );
END;
$$;
