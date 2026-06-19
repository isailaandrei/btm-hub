CREATE OR REPLACE FUNCTION public.get_admin_contact_detail_bootstrap(
  p_contact_id uuid,
  p_event_limit integer DEFAULT 26
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH selected_contact AS (
    SELECT
      id,
      email,
      name,
      phone,
      profile_id,
      created_at,
      updated_at
    FROM contacts
    WHERE id = p_contact_id
  ),
  limited_events AS (
    SELECT
      id,
      contact_id,
      type,
      custom_label,
      body,
      happened_at,
      created_at,
      updated_at,
      author_id,
      author_name,
      edited_at,
      resolved_at,
      resolved_by,
      metadata
    FROM contact_events
    WHERE contact_id = p_contact_id
    ORDER BY happened_at DESC, id DESC
    LIMIT greatest(1, least(coalesce(p_event_limit, 26), 101))
  )
  SELECT jsonb_build_object(
    'contact', to_jsonb(c),
    'applications',
      coalesce(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', a.id,
              'contact_id', a.contact_id,
              'program', a.program,
              'status', a.status,
              'answers',
                CASE
                  WHEN a.answers ? 'phone'
                    THEN jsonb_build_object('phone', a.answers->'phone')
                  ELSE '{}'::jsonb
                END,
              'submitted_at', a.submitted_at,
              'updated_at', a.updated_at
            )
            ORDER BY a.submitted_at DESC
          )
          FROM applications a
          WHERE a.contact_id = c.id
        ),
        '[]'::jsonb
      ),
    'events',
      coalesce(
        (
          SELECT jsonb_agg(to_jsonb(e) ORDER BY e.happened_at DESC, e.id DESC)
          FROM limited_events e
        ),
        '[]'::jsonb
      )
  )
  FROM selected_contact c;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_contact_detail_bootstrap(uuid, integer)
  TO authenticated;
