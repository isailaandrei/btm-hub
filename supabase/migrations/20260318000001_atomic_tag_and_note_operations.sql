-- Atomic tag and note operations for applications
-- Replaces the read-modify-write pattern with concurrency-safe RPC functions.

-- ---------------------------------------------------------------------------
-- add_application_tag
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION add_application_tag(app_id uuid, new_tag text)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  result applications%ROWTYPE;
  truncated_tag text := LEFT(new_tag, 50);
BEGIN
  UPDATE applications
  SET
    tags = CASE
      WHEN truncated_tag = ANY(tags) THEN tags
      ELSE array_append(tags, truncated_tag)
    END,
    updated_at = now()
  WHERE id = app_id
  RETURNING * INTO result;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found: %', app_id;
  END IF;

  RETURN to_jsonb(result);
END;
$$;

-- ---------------------------------------------------------------------------
-- remove_application_tag
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION remove_application_tag(app_id uuid, old_tag text)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  result applications%ROWTYPE;
BEGIN
  UPDATE applications
  SET
    tags = array_remove(tags, old_tag),
    updated_at = now()
  WHERE id = app_id
  RETURNING * INTO result;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found: %', app_id;
  END IF;

  RETURN to_jsonb(result);
END;
$$;

-- ---------------------------------------------------------------------------
-- add_admin_note
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION add_admin_note(
  app_id uuid,
  note_author_id uuid,
  note_author_name text,
  note_text text
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  result applications%ROWTYPE;
BEGIN
  UPDATE applications
  SET
    admin_notes = admin_notes || jsonb_build_array(
      jsonb_build_object(
        'author_id', note_author_id,
        'author_name', note_author_name,
        'text', note_text,
        'created_at', now()
      )
    ),
    updated_at = now()
  WHERE id = app_id
  RETURNING * INTO result;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found: %', app_id;
  END IF;

  RETURN to_jsonb(result);
END;
$$;

-- ---------------------------------------------------------------------------
-- Grants: authenticated and service_role only (not anon)
-- ---------------------------------------------------------------------------

GRANT EXECUTE ON FUNCTION add_application_tag(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION remove_application_tag(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION add_admin_note(uuid, uuid, text, text) TO authenticated, service_role;
