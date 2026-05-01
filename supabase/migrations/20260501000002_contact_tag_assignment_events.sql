CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_events_tag_assigned_assignment
  ON contact_events (contact_id, ((metadata->>'tag_id')), happened_at)
  WHERE type = 'tag_assigned'::contact_event_type
    AND metadata ? 'tag_id'
    AND metadata->>'source' IN ('contact_tags', 'contact_tags_backfill');

DROP FUNCTION IF EXISTS bulk_assign_contact_tags(uuid[], uuid);
DROP FUNCTION IF EXISTS bulk_assign_contact_tags(uuid[], uuid, uuid, text);

CREATE OR REPLACE FUNCTION bulk_assign_contact_tags(
  p_contact_ids uuid[],
  p_tag_id uuid,
  p_author_id uuid DEFAULT NULL,
  p_author_name text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  requested_count integer := COALESCE(array_length(p_contact_ids, 1), 0);
  existing_count integer := 0;
  inserted_count integer := 0;
  inserted_event_count integer := 0;
  inserted_assignments jsonb := '[]'::jsonb;
  v_author_name text := NULLIF(trim(p_author_name), '');
  v_tag_name text;
  v_category_id uuid;
  v_category_name text;
BEGIN
  IF (p_author_id IS NULL) <> (v_author_name IS NULL) THEN
    RAISE EXCEPTION 'p_author_id and p_author_name must be provided together';
  END IF;

  IF p_author_id IS NOT NULL THEN
    SELECT t.name, tc.id, tc.name
    INTO v_tag_name, v_category_id, v_category_name
    FROM tags t
    INNER JOIN tag_categories tc ON tc.id = t.category_id
    WHERE t.id = p_tag_id;

    IF v_tag_name IS NULL THEN
      RAISE EXCEPTION 'Tag not found: %', p_tag_id;
    END IF;
  END IF;

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
    RETURNING contact_id, assigned_at
  ),
  inserted_events AS (
    INSERT INTO contact_events (
      contact_id,
      type,
      custom_label,
      body,
      happened_at,
      created_at,
      updated_at,
      author_id,
      author_name,
      metadata
    )
    SELECT
      ir.contact_id,
      'tag_assigned'::contact_event_type,
      NULL,
      v_category_name || ' : ' || v_tag_name,
      ir.assigned_at,
      ir.assigned_at,
      ir.assigned_at,
      p_author_id,
      v_author_name,
      jsonb_build_object(
        'source', 'contact_tags',
        'tag_id', p_tag_id,
        'tag_name', v_tag_name,
        'tag_category_id', v_category_id,
        'tag_category_name', v_category_name,
        'assigned_at', ir.assigned_at
      )
    FROM inserted_rows ir
    WHERE p_author_id IS NOT NULL
    ON CONFLICT DO NOTHING
    RETURNING id
  )
  SELECT
    (SELECT count(*) FROM existing_contacts),
    (SELECT count(*) FROM inserted_rows),
    (SELECT count(*) FROM inserted_events),
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'contact_id', contact_id,
            'assigned_at', assigned_at
          )
          ORDER BY assigned_at, contact_id
        )
        FROM inserted_rows
      ),
      '[]'::jsonb
    )
  INTO existing_count, inserted_count, inserted_event_count, inserted_assignments;

  RETURN jsonb_build_object(
    'requested', requested_count,
    'existing', existing_count,
    'inserted', inserted_count,
    'already_assigned', GREATEST(existing_count - inserted_count, 0),
    'skipped_missing', GREATEST(requested_count - existing_count, 0),
    'inserted_events', inserted_event_count,
    'inserted_assignments', inserted_assignments
  );
END;
$$;
