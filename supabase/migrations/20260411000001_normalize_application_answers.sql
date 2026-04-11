-- ---------------------------------------------------------------------------
-- Normalize legacy typos & a referral_source ingestion bug in applications.
--
-- The existing 99 applications were imported from partner A's 4 Google Forms
-- via an off-repo ingest script. Three of them contain typos the code-side
-- forms rewrite has now fixed:
--
--   1. age = "54+"  →  "55+"  (filmmaking + photography + freediving)
--      Partner A's Google Forms have a "54+" bucket that's almost certainly
--      meant to be "55+"; the rewritten code and Google Forms will use "55+".
--
--   2. time_availability contains "aproject" (no space) → replace with
--      "a project". Filmmaking + photography rows only — the typo is in
--      the middle of the option label "2-3 entire weeks at a time for a
--      workshop, a project or individual training".
--
--   3. income_from_photography = "No, thats not my goal." → "No, that's not
--      my goal." (single photography row — missing apostrophe).
--
-- Plus one ingestion pipeline bug:
--
--   4. referral_source array got erroneously split on commas inside the
--      option label "Social Media (Instagram, Facebook, etc.)" — the
--      resulting array is ["Social Media (Instagram", "Facebook", "etc.)"]
--      instead of ["Social Media (Instagram, Facebook, etc.)"]. Rebuild
--      the array with the single canonical string.
--
-- Local verification: `supabase db reset` triggers via hook after this file
-- is added. Re-run the baseline queries at the bottom to confirm zero rows
-- remain with legacy values.
--
-- Production: push with `supabase db push` once local verification passes.
-- ---------------------------------------------------------------------------

-- (1) Age "54+" → "55+"
UPDATE applications
SET answers = jsonb_set(answers, '{age}', '"55+"'::jsonb)
WHERE program IN ('filmmaking', 'photography', 'freediving')
  AND answers->>'age' = '54+';

-- (2) time_availability: "aproject" → "a project"
UPDATE applications
SET answers = jsonb_set(
  answers,
  '{time_availability}',
  to_jsonb(replace(answers->>'time_availability', 'aproject', 'a project'))
)
WHERE program IN ('filmmaking', 'photography')
  AND answers->>'time_availability' LIKE '%aproject%';

-- (3) income_from_photography: add missing apostrophe in "thats"
UPDATE applications
SET answers = jsonb_set(
  answers,
  '{income_from_photography}',
  '"No, that''s not my goal."'::jsonb
)
WHERE program = 'photography'
  AND answers->>'income_from_photography' = 'No, thats not my goal.';

-- (4) referral_source: merge the split ["Social Media (Instagram",
--     "Facebook", "etc.)"] sub-sequence back into the single canonical
--     "Social Media (Instagram, Facebook, etc.)" element. Only affects
--     rows where all 3 fragments appear (i.e., the exact ingest-bug
--     signature); pre-audited to confirm no standalone "Facebook" rows
--     would be accidentally modified.
UPDATE applications
SET answers = jsonb_set(
  answers,
  '{referral_source}',
  COALESCE(
    (
      SELECT jsonb_agg(x)
      FROM jsonb_array_elements_text(answers->'referral_source') AS x
      WHERE x NOT IN (
        'Social Media (Instagram',
        'Facebook',
        'etc.)'
      )
    ),
    '[]'::jsonb
  ) || '["Social Media (Instagram, Facebook, etc.)"]'::jsonb
)
WHERE answers->'referral_source' @> '["Social Media (Instagram"]'::jsonb
  AND answers->'referral_source' @> '["Facebook"]'::jsonb
  AND answers->'referral_source' @> '["etc.)"]'::jsonb;

-- ---------------------------------------------------------------------------
-- Verification queries (run manually after applying — each must return 0).
-- ---------------------------------------------------------------------------
--
-- SELECT count(*) FROM applications WHERE answers->>'age' = '54+';
-- SELECT count(*) FROM applications WHERE answers->>'time_availability' LIKE '%aproject%';
-- SELECT count(*) FROM applications WHERE answers->>'income_from_photography' = 'No, thats not my goal.';
-- SELECT count(*) FROM applications WHERE answers->'referral_source' @> '["Social Media (Instagram"]'::jsonb;
--
-- Counter-checks (each should return the migrated row counts):
-- SELECT count(*) FROM applications WHERE answers->>'age' = '55+';
-- SELECT count(*) FROM applications WHERE answers->>'time_availability' LIKE '%, a project or individual training';
-- SELECT count(*) FROM applications WHERE answers->>'income_from_photography' = 'No, that''s not my goal.';
-- SELECT count(*) FROM applications WHERE answers->'referral_source' @> '["Social Media (Instagram, Facebook, etc.)"]'::jsonb;
