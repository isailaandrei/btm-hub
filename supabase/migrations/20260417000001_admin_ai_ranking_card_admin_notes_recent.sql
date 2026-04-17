-- Add a compact raw admin-notes surface to the ranking card so the
-- global ranking pass sees admin-authored high-signal text (tags,
-- recent admin notes) without requiring a dossier rebuild every time
-- admins triage contacts.
--
-- Populated deterministically by `refreshContactMemoryFacts` (no AI
-- call) on tag/note mutations, and by the full rebuild flow during
-- backfill.

ALTER TABLE crm_ai_contact_ranking_cards
  ADD COLUMN IF NOT EXISTS admin_notes_recent_json jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN crm_ai_contact_ranking_cards.admin_notes_recent_json IS
  'Top N most recent contact + application admin notes for this contact, each truncated. Raw admin-authored text carried into the ranking prompt without AI interpretation.';
