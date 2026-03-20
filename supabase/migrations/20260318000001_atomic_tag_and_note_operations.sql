-- Atomic tag and note operations for applications
-- Replaces the read-modify-write pattern with concurrency-safe RPC functions.

-- ---------------------------------------------------------------------------
-- add_application_tag
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION add_application_tag(app_id uuid, new_tag text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER  -- runs with caller's permissions so RLS applies
AS $$
DECLARE
  result applications%ROWTYPE;
BEGIN
  IF LENGTH(new_tag) > 50 THEN
    RAISE EXCEPTION 'Tag exceeds 50 characters: %', LEFT(new_tag, 20) || '...';
  END IF;

  UPDATE applications
  SET
    tags = CASE
      WHEN new_tag = ANY(tags) THEN tags
      ELSE array_append(tags, new_tag)
    END,
    updated_at = CASE
      WHEN new_tag = ANY(tags) THEN updated_at
      ELSE now()
    END
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
SECURITY INVOKER  -- runs with caller's permissions so RLS applies
AS $$
DECLARE
  result applications%ROWTYPE;
BEGIN
  UPDATE applications
  SET
    tags = array_remove(tags, old_tag),
    updated_at = now()
  WHERE id = app_id
    AND old_tag = ANY(tags)
  RETURNING * INTO result;

  IF NOT FOUND THEN
    -- Could be missing application or tag not present; check which
    IF NOT EXISTS (SELECT 1 FROM applications WHERE id = app_id) THEN
      RAISE EXCEPTION 'Application not found: %', app_id;
    END IF;
    -- Tag wasn't present — return current row unchanged
    SELECT * INTO result FROM applications WHERE id = app_id;
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
SECURITY INVOKER  -- runs with caller's permissions so RLS applies
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
