WITH normalized AS (
  SELECT
    id,
    (
      answers
      || CASE
        WHEN
          NULLIF(BTRIM(answers ->> 'accommodation_ties'), '') IS NULL
          AND NULLIF(BTRIM(answers ->> 'azores_ties'), '') IS NOT NULL
        THEN jsonb_build_object('accommodation_ties', answers -> 'azores_ties')
        ELSE '{}'::jsonb
      END
      || CASE
        WHEN
          NULLIF(BTRIM(answers ->> 'internship_hopes'), '') IS NULL
          AND NULLIF(BTRIM(answers ->> 'hoped_gains'), '') IS NOT NULL
        THEN jsonb_build_object('internship_hopes', answers -> 'hoped_gains')
        ELSE '{}'::jsonb
      END
      || CASE
        WHEN
          NULLIF(BTRIM(answers ->> 'candidacy_reason'), '') IS NULL
          AND NULLIF(BTRIM(answers ->> 'why_good_candidate'), '') IS NOT NULL
        THEN jsonb_build_object('candidacy_reason', answers -> 'why_good_candidate')
        ELSE '{}'::jsonb
      END
    ) - 'azores_ties' - 'hoped_gains' - 'why_good_candidate' AS answers
  FROM public.applications
  WHERE program = 'internship'
    AND (
      answers ? 'azores_ties'
      OR answers ? 'hoped_gains'
      OR answers ? 'why_good_candidate'
    )
)
UPDATE public.applications AS applications
SET
  answers = normalized.answers,
  updated_at = now()
FROM normalized
WHERE applications.id = normalized.id
  AND applications.answers IS DISTINCT FROM normalized.answers;
