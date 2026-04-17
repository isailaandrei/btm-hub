-- Expand the admin AI facts view with curated structured fields that the
-- Phase 1 planner can emit as exact filters.
--
-- Task 2 widened `ADMIN_AI_STRUCTURED_FIELDS` to include registry-derived
-- non-text fields, and Task 4's planner relies on curated fields like
-- `btm_category`. The original view omitted that column, which meant the
-- planner could emit a valid-looking filter that the facts query would route
-- to a non-existent SQL column at runtime. We append the new column at the
-- end of the view because PostgreSQL `CREATE OR REPLACE VIEW` cannot insert a
-- column into the middle of an existing view definition.

CREATE OR REPLACE VIEW admin_ai_contact_facts
WITH (security_invoker = true) AS
SELECT
  c.id AS contact_id,
  a.id AS application_id,
  c.name AS contact_name,
  c.email AS contact_email,
  c.phone AS contact_phone,
  a.program,
  a.status,
  a.submitted_at,
  COALESCE(ct.tag_ids, ARRAY[]::uuid[]) AS tag_ids,
  COALESCE(ct.tag_names, ARRAY[]::text[]) AS tag_names,
  a.answers ->> 'budget' AS budget,
  a.answers ->> 'time_availability' AS time_availability,
  a.answers ->> 'start_timeline' AS start_timeline,
  a.answers ->> 'travel_willingness' AS travel_willingness,
  a.answers ->> 'languages' AS languages,
  a.answers ->> 'country_of_residence' AS country_of_residence,
  a.answers ->> 'certification_level' AS certification_level,
  a.answers ->> 'years_experience' AS years_experience,
  a.answers ->> 'involvement_level' AS involvement_level,
  a.answers ->> 'btm_category' AS btm_category
FROM contacts c
LEFT JOIN applications a ON a.contact_id = c.id
LEFT JOIN LATERAL (
  SELECT
    array_agg(t.id ORDER BY t.name) AS tag_ids,
    array_agg(t.name ORDER BY t.name) AS tag_names
  FROM contact_tags xt
  JOIN tags t ON t.id = xt.tag_id
  WHERE xt.contact_id = c.id
) ct ON TRUE;
