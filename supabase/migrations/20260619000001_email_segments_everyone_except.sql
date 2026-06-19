-- Email segments: support "everyone except people with tag X".
--
-- Previously a segment with no include tags resolved to nobody. Now an empty
-- include set means "start from every contact", so an exclude-only rule
-- (includeTagIds: [], excludeTagIds: [X]) reads as "everybody except X".
-- Rule shape (JSONB) is unchanged:
--   { "match": "all" | "any", "includeTagIds": uuid[], "excludeTagIds": uuid[] }
-- match='all' requires every include tag; match='any' requires at least one.
-- Any exclude tag removes the contact from the result.

CREATE OR REPLACE FUNCTION resolve_email_segment_contacts(
  p_include uuid[],
  p_exclude uuid[],
  p_match text
) RETURNS TABLE (contact_id uuid)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH base AS (
    -- No include tags → start from everyone ("all contacts except …").
    (
      SELECT c.id AS contact_id
      FROM contacts c
      WHERE p_include IS NULL OR cardinality(p_include) = 0
    )
    UNION
    -- Include tags → contacts matching all / any of them.
    (
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
  )
  SELECT b.contact_id
  FROM base b
  WHERE NOT EXISTS (
    SELECT 1
    FROM contact_tags ex
    WHERE ex.contact_id = b.contact_id
      AND p_exclude IS NOT NULL
      AND ex.tag_id = ANY (p_exclude)
  );
$$;
