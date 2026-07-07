-- WhatsApp media persistence: copy attachment bytes out of YCloud (which
-- retains media only 30 DAYS) into our own private Storage bucket, so
-- attachments survive provider expiry.
--
-- conversation_messages.media_json keeps the original [{url, contentType}]
-- provider links untouched; this table is the archive work-queue + ledger,
-- one row per (message, attachment index). Rows are seeded from media_json by
-- seed_conversation_media_queue() and driven to a terminal state by the
-- archiver (src/lib/conversations/media-archive.ts):
--   pending  -> stored   (bytes uploaded to the whatsapp-media bucket)
--   pending  -> expired  (upstream 404/403/410 — gone before we archived it)
--   pending  -> failed   (5 attempts exhausted; kept visible for review)

-- ---------------------------------------------------------------------------
-- Private bucket. No storage.objects policies on purpose: the ONLY read path
-- is the admin-gated proxy route, which uses the service-role client to mint
-- short-lived signed URLs. Nothing here is browser-accessible directly.
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('whatsapp-media', 'whatsapp-media', false)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public;

-- ---------------------------------------------------------------------------
-- Archive ledger
-- ---------------------------------------------------------------------------

CREATE TABLE conversation_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL
    REFERENCES conversation_messages(id) ON DELETE CASCADE,
  media_index integer NOT NULL CHECK (media_index >= 0),
  -- Copied from the message at seed time so the archiver can process the
  -- OLDEST media first (closest to YCloud's 30-day expiry cliff).
  message_happened_at timestamptz NOT NULL,
  source_url text NOT NULL,
  content_type text,
  storage_path text,
  size_bytes bigint,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'stored', 'expired', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  fetched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversation_media_message_index_unique
    UNIQUE (message_id, media_index),
  -- A stored row must actually point at bytes.
  CONSTRAINT conversation_media_stored_has_path
    CHECK (status <> 'stored' OR storage_path IS NOT NULL)
);

CREATE INDEX idx_conversation_media_pending_oldest
  ON conversation_media (message_happened_at)
  WHERE status = 'pending';

ALTER TABLE conversation_media ENABLE ROW LEVEL SECURITY;

-- Admins can see archive state (proxy fallback logic, future badge UIs).
-- No INSERT/UPDATE/DELETE policies: only the service-role archiver writes.
CREATE POLICY "Admins can read conversation media" ON conversation_media
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

GRANT SELECT ON conversation_media TO authenticated;

-- ---------------------------------------------------------------------------
-- Queue seeding: one pending row per media_json entry that has no row yet.
-- Idempotent (ON CONFLICT DO NOTHING), so the archiver can call it every run;
-- newly ingested messages get picked up automatically.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION seed_conversation_media_queue()
RETURNS integer
LANGUAGE sql
AS $$
  WITH seeded AS (
    INSERT INTO conversation_media
      (message_id, media_index, message_happened_at, source_url, content_type)
    SELECT
      m.id,
      (t.idx - 1)::integer,
      m.happened_at,
      t.item->>'url',
      NULLIF(t.item->>'contentType', '')
    FROM conversation_messages m
    CROSS JOIN LATERAL jsonb_array_elements(m.media_json)
      WITH ORDINALITY AS t(item, idx)
    WHERE t.item->>'url' IS NOT NULL
    ON CONFLICT (message_id, media_index) DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::integer FROM seeded;
$$;

-- Service-role only: the seeder writes rows, so keep it out of reach of the
-- authenticated role (RLS has no insert policy anyway; this avoids a
-- confusing permission error surface).
REVOKE ALL ON FUNCTION seed_conversation_media_queue() FROM public;
REVOKE ALL ON FUNCTION seed_conversation_media_queue() FROM anon;
REVOKE ALL ON FUNCTION seed_conversation_media_queue() FROM authenticated;
