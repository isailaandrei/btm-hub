-- Migration: contact_events — per-contact event timeline
-- Additive + backfill of contact_notes → contact_events (type='note').
-- Aborts if backfill row count does not match source.

-- 1. Enum for event types
CREATE TYPE contact_event_type AS ENUM (
  'note',
  'call',
  'in_person_meeting',
  'message',
  'info_requested',
  'awaiting_btm_response',
  'mentor_assigned',
  'custom'
);

-- 2. Main table
CREATE TABLE contact_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id    uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  type          contact_event_type NOT NULL,
  custom_label  text,
  body          text NOT NULL DEFAULT '' CHECK (char_length(body) <= 5000),
  happened_at   timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  author_id     uuid NOT NULL REFERENCES auth.users(id),
  author_name   text NOT NULL,
  edited_at     timestamptz,
  resolved_at   timestamptz,
  resolved_by   uuid REFERENCES auth.users(id),
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK (
    type <> 'custom'
    OR (custom_label IS NOT NULL AND char_length(custom_label) > 0 AND char_length(custom_label) <= 80)
  ),
  CHECK (type IN ('info_requested', 'awaiting_btm_response') OR resolved_at IS NULL),
  CHECK (resolved_at IS NULL OR resolved_by IS NOT NULL)
);

-- 3. Indexes
CREATE INDEX idx_contact_events_contact_happened
  ON contact_events (contact_id, happened_at DESC);

CREATE INDEX idx_contact_events_open_pending
  ON contact_events (contact_id, type)
  WHERE resolved_at IS NULL
    AND type IN ('info_requested', 'awaiting_btm_response');

-- 4. RLS — admin-only, mirrors contact_notes pattern
ALTER TABLE contact_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read contact_events" ON contact_events
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));
CREATE POLICY "Admins can insert contact_events" ON contact_events
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));
CREATE POLICY "Admins can update contact_events" ON contact_events
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));
CREATE POLICY "Admins can delete contact_events" ON contact_events
  FOR DELETE USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

-- 5. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE contact_events;
ALTER TABLE contact_events REPLICA IDENTITY FULL;

-- 6. Backfill existing notes as type='note' events
INSERT INTO contact_events
  (id, contact_id, type, body, happened_at, created_at, updated_at,
   author_id, author_name)
SELECT
  id,
  contact_id,
  'note'::contact_event_type,
  text,
  created_at,    -- happened_at = created_at (no backdating info for old notes)
  created_at,
  created_at,    -- contact_notes has no updated_at; seed with created_at
  author_id,
  author_name
FROM contact_notes;

-- 7. Hard assertion: row counts must match
DO $$
DECLARE
  src_count bigint;
  dst_count bigint;
BEGIN
  SELECT count(*) INTO src_count FROM contact_notes;
  SELECT count(*) INTO dst_count FROM contact_events WHERE type = 'note';
  IF src_count <> dst_count THEN
    RAISE EXCEPTION 'contact_events backfill mismatch: contact_notes=% contact_events(note)=%',
      src_count, dst_count;
  END IF;
END $$;
