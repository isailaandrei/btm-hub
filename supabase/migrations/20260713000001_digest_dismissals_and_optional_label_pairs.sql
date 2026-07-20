-- Digest dismissals + optional (label-less) corrections. Owner-approved
-- 2026-07-13. Round 2 of the digest-memory work. Two motivations:
--
-- (a) CROWDING. The contact "AI conversation memory" card lists every non-noise
--     digest forever; aged status digests (a trip that already happened) pile up
--     and bury the live ones. Admins need to remove a status digest from AI
--     memory NOW ("this is done — expire it early"), without waiting for the
--     45-day / event-grace horizon. That is a DISMISSAL, not a delete: a
--     recalibration wipe re-digests the identical window and would resurrect a
--     truly-deleted row, and the model's original output must survive as data
--     for the calibration dataset. So a dismissal is stored as a correction
--     overlay (dismissed_at / dismissed_by) that the corpus filter honors and
--     the UI can revert. Only meaningful for status digests (profile is
--     permanent; noise is already hidden).
--
-- (b) IDENTITY LABEL PAIRS POLLUTING CALIBRATION. Round 1 made every correction
--     record a label pair (original -> corrected), even when the admin only
--     edited the summary or event date and left the label untouched. Those
--     "profile -> profile" identity pairs are noise in the taxonomy-tuning
--     dataset (scripts/digest-correction-pairs.test.ts). We make the label pair
--     OPTIONAL: corrected_is_noise IS NULL now means "this correction carries NO
--     label correction" — it exists only to overlay a summary, event date, or
--     dismissal, and the effective view inherits the model's label. A label
--     correction (corrected_is_noise NOT NULL) still records the true original.
--
-- Additive/loosening only — no data migration. Existing correction rows keep
-- their label pair (corrected_is_noise stays non-null on them).

-- ---------------------------------------------------------------------------
-- conversation_digest_corrections: optional label pair + dismissal columns.
-- ---------------------------------------------------------------------------

-- The label pair is now optional. corrected_is_noise IS NULL = no label
-- correction (inherit the model's label); corrected_relevance is only
-- meaningful when corrected_is_noise IS NOT NULL (null relevance + is_noise=true
-- = noise, as before). original_is_noise likewise becomes null on a label-less
-- correction — there is no original to record when the label was not changed.
ALTER TABLE conversation_digest_corrections
  ALTER COLUMN corrected_is_noise DROP NOT NULL,
  ALTER COLUMN corrected_is_noise DROP DEFAULT,
  ALTER COLUMN original_is_noise DROP NOT NULL;

-- Replace the round-1 shape check: it assumed corrected_is_noise was always
-- true/false. Add the label-less case (corrected_is_noise IS NULL ⇒ no
-- relevance) alongside the noise/signal cases.
ALTER TABLE conversation_digest_corrections
  DROP CONSTRAINT conversation_digest_corrections_label_shape;

ALTER TABLE conversation_digest_corrections
  ADD CONSTRAINT conversation_digest_corrections_label_shape CHECK (
    (corrected_is_noise IS NULL AND corrected_relevance IS NULL)
    OR (corrected_is_noise = true AND corrected_relevance IS NULL)
    OR (corrected_is_noise = false AND corrected_relevance IS NOT NULL)
  );

COMMENT ON COLUMN conversation_digest_corrections.corrected_is_noise IS
  'NULL = this correction carries NO label correction (only a summary/event-date/dismissal overlay); the effective view inherits the model''s label. true = corrected to noise. false = corrected to a signal (corrected_relevance names profile/status).';

-- A dismissal removes a (status) digest from AI memory immediately — an admin
-- saying "this is done, expire it now". Revertible (clear both columns). Stored
-- as an overlay so a recalibration wipe cannot resurrect it and the model row is
-- never mutated. Only meaningful for status digests (enforced in the action).
ALTER TABLE conversation_digest_corrections
  ADD COLUMN dismissed_at timestamptz,
  ADD COLUMN dismissed_by uuid REFERENCES profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN conversation_digest_corrections.dismissed_at IS
  'When set, an admin removed this digest from AI memory ahead of its natural expiry (a status digest whose subject is done). The corpus filter drops dismissed digests immediately; NULL = not dismissed. Revertible.';

-- ---------------------------------------------------------------------------
-- Recreate the effective read-model: per-field label overlay + dismissal tail.
-- ---------------------------------------------------------------------------
--
-- Preserves every existing column (name/type/order) so CREATE OR REPLACE is
-- legal, and appends dismissed_at/dismissed_by at the tail. Changes vs. round 1:
--   - is_noise / relevance are now overlaid PER FIELD keyed on
--     correction.corrected_is_noise (NOT correction.content_hash): a correction
--     row that carries no label (corrected_is_noise IS NULL) leaves the model's
--     label standing, so a summary/date/dismissal-only correction no longer
--     forces a label. A missing correction row also has corrected_is_noise NULL,
--     so "no correction" and "label-less correction" collapse to the same
--     model-label fallback.
--   - dismissed_at / dismissed_by exposed for the corpus filter and the UI.
-- summary / event_date coalesce overlays and the model_*/corrected_* audit
-- columns are unchanged.

CREATE OR REPLACE VIEW conversation_digests_effective
WITH (security_invoker = true)
AS
SELECT
  digest.id,
  digest.contact_id,
  digest.source,
  digest.window_start,
  digest.window_end,
  digest.first_message_id,
  digest.last_message_id,
  -- Effective summary: a non-empty human correction wins, else the model's.
  coalesce(nullif(correction.corrected_summary, ''), digest.summary) AS summary,
  digest.source_message_count,
  digest.content_hash,
  digest.generator_model,
  digest.generator_version,
  digest.created_at,
  -- Effective label, overlaid per field: a label-less correction
  -- (corrected_is_noise IS NULL) — or no correction at all — inherits the
  -- model's is_noise/relevance; a label correction replaces both.
  CASE
    WHEN correction.corrected_is_noise IS NULL THEN digest.is_noise
    ELSE correction.corrected_is_noise
  END AS is_noise,
  CASE
    WHEN correction.corrected_is_noise IS NULL THEN digest.relevance
    ELSE correction.corrected_relevance
  END AS relevance,
  digest.is_noise AS model_is_noise,
  digest.relevance AS model_relevance,
  correction.created_at AS correction_created_at,
  correction.corrected_by,
  -- Effective event date: a human correction wins, else the model's extraction.
  coalesce(correction.corrected_event_date, digest.event_date) AS event_date,
  -- The model's originals + the raw correction values (audit + client merge).
  digest.summary AS model_summary,
  digest.event_date AS model_event_date,
  correction.corrected_summary,
  correction.corrected_event_date,
  -- Dismissal overlay (status digests only): removes the digest from the AI
  -- corpus immediately, regardless of freshness. Revertible.
  correction.dismissed_at,
  correction.dismissed_by
FROM conversation_digests digest
LEFT JOIN conversation_digest_corrections correction
  ON correction.content_hash = digest.content_hash;

GRANT SELECT ON conversation_digests_effective TO authenticated;
