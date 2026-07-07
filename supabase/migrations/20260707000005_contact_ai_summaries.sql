-- Per-contact AI summaries (task 1c): one AI-written CRM summary per contact,
-- regenerated ONLY when the contact's rendered card changes (content-hash
-- staleness, same idempotency idea as conversation_digests.content_hash).
-- Summaries are a READ surface for admins (and later email-drafting context);
-- they deliberately do NOT feed back into the AI's own corpus — no
-- AI-reading-AI loops.

CREATE TABLE contact_ai_summaries (
  contact_id uuid PRIMARY KEY REFERENCES contacts(id) ON DELETE CASCADE,
  summary text NOT NULL CHECK (btrim(summary) <> ''),
  response_json jsonb,
  card_content_hash text NOT NULL,
  model text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE contact_ai_summaries ENABLE ROW LEVEL SECURITY;

-- Admins read; only the service-role generator writes (no write policies).
CREATE POLICY "Admins can read contact AI summaries" ON contact_ai_summaries
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

GRANT SELECT ON contact_ai_summaries TO authenticated;
