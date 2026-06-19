-- Email studio redesign — Phase 4: dynamic segments.
--
-- A segment is a saved tag rule, re-evaluated at send time (always current),
-- unlike a list's frozen membership. Rule shape (JSONB):
--   { "match": "all" | "any", "includeTagIds": uuid[], "excludeTagIds": uuid[] }
-- Segments target contacts only (manual recipients have no tags).

CREATE TABLE email_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(trim(name)) > 0 AND char_length(name) <= 120),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 500),
  rule jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_segments_updated_at ON email_segments (updated_at DESC);

ALTER TABLE email_segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage email segments" ON email_segments
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- Resolve a tag rule to the contacts that currently match it. Returns no rows
-- when no include tags are given (a segment must include at least one tag).
-- match='all' requires every include tag; match='any' requires at least one.
-- Any exclude tag removes the contact.
CREATE OR REPLACE FUNCTION resolve_email_segment_contacts(
  p_include uuid[],
  p_exclude uuid[],
  p_match text
) RETURNS TABLE (contact_id uuid)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH included AS (
    SELECT ct.contact_id
    FROM contact_tags ct
    WHERE p_include IS NOT NULL
      AND cardinality(p_include) > 0
      AND ct.tag_id = ANY (p_include)
    GROUP BY ct.contact_id
    HAVING
      p_match <> 'all'
      OR count(DISTINCT ct.tag_id) = cardinality(p_include)
  )
  SELECT i.contact_id
  FROM included i
  WHERE NOT EXISTS (
    SELECT 1
    FROM contact_tags ex
    WHERE ex.contact_id = i.contact_id
      AND p_exclude IS NOT NULL
      AND ex.tag_id = ANY (p_exclude)
  );
$$;
