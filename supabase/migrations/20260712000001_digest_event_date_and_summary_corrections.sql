-- Event-aware digest expiry + human-authored summary/event-date corrections.
-- Owner-approved 2026-07-12. Two problems this fixes:
--
-- (a) STATUS digests expire at window_end + 45 days — anchored to the MESSAGE
--     date, never the event the exchange is about. A digest sent 4/20 saying
--     "arriving August 17th" aged out 6/4, before the arrival. We add an
--     AI-extracted `event_date` so status content stays visible until the event
--     (event_date + a short grace), whichever is later than the message-age rule.
--
-- (b) The code-level noise gate records short info-dense windows (e.g.
--     "T shirt size: L / Rashguard: XL") as is_noise markers with an EMPTY
--     summary and NO model call, and noise rows are hidden from the admin memory
--     UI — so there was no way to rescue one. A noise->signal rescue needs a
--     summary to exist, so we let a correction carry a human-authored
--     `corrected_summary` (and `corrected_event_date`). Corrections still never
--     mutate the model's original rows — they overlay via the effective view.
--
-- Additive only: existing rows get NULL event_date until the next owner-
-- triggered recalibration wipe re-digests them (or a manual correction sets one).
-- DIGEST_GENERATOR_VERSION is intentionally NOT bumped, so content hashes stay
-- stable and existing corrections keep re-attaching.

ALTER TABLE conversation_digests
  ADD COLUMN event_date date;

COMMENT ON COLUMN conversation_digests.event_date IS
  'AI-extracted calendar date of the future event the window references (trip/arrival/booking). NULL when the window references no concrete upcoming date. Drives event-aware status visibility (see conversation_digests_effective + STATUS_EVENT_GRACE_DAYS).';

-- A correction may now also override the summary text (noise-rescue: a
-- human-authored summary where the model produced none) and the event date.
-- Both are nullable: a label-only correction leaves them NULL and the effective
-- view falls back to the model's original values.
ALTER TABLE conversation_digest_corrections
  ADD COLUMN corrected_summary text,
  ADD COLUMN corrected_event_date date;

COMMENT ON COLUMN conversation_digest_corrections.corrected_summary IS
  'Human-authored summary that overrides the model summary in the effective view. NULL (or empty) = no summary correction; the model summary stands. The rescue path for noise-marker windows, which carry an empty model summary.';
COMMENT ON COLUMN conversation_digest_corrections.corrected_event_date IS
  'Human-corrected event date that overrides the model event_date in the effective view. NULL = no event-date correction.';

-- ---------------------------------------------------------------------------
-- Recreate the effective read-model with the summary + event-date overlays.
-- ---------------------------------------------------------------------------
--
-- Preserves every existing column (name/type/order) so CREATE OR REPLACE is
-- legal, and appends the new ones at the tail. Same semantics as before
-- (security_invoker = true) plus:
--   - summary   -> coalesce(nullif(corrected_summary, ''), model summary), so a
--                  human-authored rescue summary flows into every AI read path.
--                  nullif('') guards against an empty correction wiping a real
--                  model summary.
--   - event_date -> coalesce(corrected_event_date, model event_date).
--   - model_summary / model_event_date: the model's originals, always exposed
--     (mirrors model_is_noise / model_relevance) for "AI suggested" UI hints and
--     for the server action's empty-effective-summary guard.
--   - corrected_summary / corrected_event_date: the RAW correction values, so a
--     client sending the complete desired correction state can merge them
--     (a label-only edit must not wipe a previously corrected summary/date).

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
  CASE
    WHEN correction.content_hash IS NULL THEN digest.is_noise
    ELSE correction.corrected_is_noise
  END AS is_noise,
  CASE
    WHEN correction.content_hash IS NULL THEN digest.relevance
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
  correction.corrected_event_date
FROM conversation_digests digest
LEFT JOIN conversation_digest_corrections correction
  ON correction.content_hash = digest.content_hash;

GRANT SELECT ON conversation_digests_effective TO authenticated;
