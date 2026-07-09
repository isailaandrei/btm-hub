-- Admin corrections for conversation-digest labels (digest-label feedback).
--
-- The AI-visibility badges surfaced real miscalibrations — some WhatsApp
-- digests labeled `profile` should have been `status` (or noise). Admins can
-- correct a digest's label from the contact page; the correction both fixes
-- the AI's own view (via the `conversation_digests_effective` read-model
-- below) and accumulates a calibration dataset (original -> corrected label
-- pairs) for tuning the digest taxonomy prompt.
--
-- Keyed by `content_hash`, NOT a foreign key to `conversation_digests` and NOT
-- the digest's `id` — ON PURPOSE. Recalibration wipes (`docs/admin-ai-
-- handbook.md` §6) delete and regenerate `conversation_digests` rows; a
-- re-digested IDENTICAL window reproduces the same content hash
-- (`buildDigestContentHash` in `src/lib/conversations/digests.ts`), so a
-- correction keyed by hash automatically reapplies to the new row. A
-- correction keyed by digest id would be silently lost on every recalibration.
--
-- Corrections never mutate `conversation_digests` rows — the model's original
-- output stays intact as data, and the ORIGINAL label is stored alongside the
-- correction so the pair is the calibration dataset (see
-- scripts/digest-correction-pairs.test.ts).

CREATE TABLE conversation_digest_corrections (
  content_hash text PRIMARY KEY,
  -- 'profile' | 'status' for a signal correction; NULL when corrected to noise.
  corrected_relevance text CHECK (corrected_relevance IN ('profile', 'status')),
  corrected_is_noise boolean NOT NULL DEFAULT false,
  -- The model's original label, captured at correction time — the reference
  -- point for the calibration dataset. Mirrors the same shape/constraint as
  -- conversation_digests.relevance (null on an originally-noise digest).
  original_relevance text CHECK (original_relevance IN ('profile', 'status')),
  original_is_noise boolean NOT NULL,
  corrected_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Exactly one meaning holds: a noise correction carries no relevance, a
  -- signal correction (profile/status) always carries one.
  CONSTRAINT conversation_digest_corrections_label_shape CHECK (
    (corrected_is_noise = true AND corrected_relevance IS NULL)
    OR (corrected_is_noise = false AND corrected_relevance IS NOT NULL)
  )
);

ALTER TABLE conversation_digest_corrections ENABLE ROW LEVEL SECURITY;

-- Admins read; only the service-role write path (correctContactDigestLabel,
-- a requireAdmin server action) writes — no INSERT/UPDATE/DELETE policies.
CREATE POLICY "Admins can read digest corrections" ON conversation_digest_corrections
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

GRANT SELECT ON conversation_digest_corrections TO authenticated;

-- ---------------------------------------------------------------------------
-- Effective read-model: conversation_digests with corrections overlaid.
-- ---------------------------------------------------------------------------
--
-- Every read path that feeds the AI or an AI-visibility UI (contact cards,
-- the eval live-lib mirror, the contact page's AI-memory section) reads this
-- view instead of `conversation_digests` directly, so an admin correction
-- takes effect immediately everywhere without ever mutating the original row.
-- `security_invoker = true` so the caller's own RLS on the underlying tables
-- decides visibility (same pattern as `conversation_current_facts`).

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
  digest.summary,
  digest.source_message_count,
  digest.content_hash,
  digest.generator_model,
  digest.generator_version,
  digest.created_at,
  -- Effective label: a correction, when one exists, fully replaces the
  -- model's is_noise/relevance pair (not a per-field coalesce — a
  -- signal-to-noise correction must clear relevance, and a per-field
  -- COALESCE would leave a stale relevance value behind).
  CASE
    WHEN correction.content_hash IS NULL THEN digest.is_noise
    ELSE correction.corrected_is_noise
  END AS is_noise,
  CASE
    WHEN correction.content_hash IS NULL THEN digest.relevance
    ELSE correction.corrected_relevance
  END AS relevance,
  -- The model's original output, always available regardless of correction —
  -- lets UIs show "corrected from X" and lets the write path always record
  -- the true original (not a previous correction) on re-correction.
  digest.is_noise AS model_is_noise,
  digest.relevance AS model_relevance,
  correction.created_at AS correction_created_at,
  correction.corrected_by
FROM conversation_digests digest
LEFT JOIN conversation_digest_corrections correction
  ON correction.content_hash = digest.content_hash;

GRANT SELECT ON conversation_digests_effective TO authenticated;
