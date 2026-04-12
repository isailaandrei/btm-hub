-- ---------------------------------------------------------------------------
-- Convert certification_level and languages from comma-joined strings to
-- JSON arrays so their storage shape matches all other multiselect fields.
--
-- The Google Forms CSV importer originally stored these two fields as raw
-- comma-joined strings (STRING_MULTI) while every other multiselect was
-- split into a JSON array (ARRAY_MULTI). New web-form submissions produce
-- arrays via JSON.parse, so leaving the legacy rows as strings creates two
-- incompatible shapes in the same column.
--
-- The jsonb_typeof guard ensures rows that are already arrays (from any
-- web submissions that occurred before this migration) are left untouched.
--
-- Edge case: some legacy certification_level values contain the old Google
-- Forms option "Certified Freediver, please specify level below:" which
-- itself has a comma. Splitting on ", " fragments this, but the canonical
-- certifications (Open Water, Rescue Diver, etc.) are extracted correctly
-- and the fragments fall to the "Other" filter bucket in the admin UI.
-- ---------------------------------------------------------------------------

-- (1) certification_level: string → array
UPDATE applications
SET answers = jsonb_set(
  answers,
  '{certification_level}',
  (
    SELECT jsonb_agg(trim(x))
    FROM regexp_split_to_table(answers->>'certification_level', ', ') AS x
    WHERE trim(x) <> ''
  )
)
WHERE jsonb_typeof(answers->'certification_level') = 'string'
  AND answers->>'certification_level' <> '';

-- (2) languages: string → array
UPDATE applications
SET answers = jsonb_set(
  answers,
  '{languages}',
  (
    SELECT jsonb_agg(trim(x))
    FROM regexp_split_to_table(answers->>'languages', ', ') AS x
    WHERE trim(x) <> ''
  )
)
WHERE jsonb_typeof(answers->'languages') = 'string'
  AND answers->>'languages' <> '';

-- Verification (should return 0 after migration):
-- SELECT count(*) FROM applications WHERE jsonb_typeof(answers->'certification_level') = 'string';
-- SELECT count(*) FROM applications WHERE jsonb_typeof(answers->'languages') = 'string';
