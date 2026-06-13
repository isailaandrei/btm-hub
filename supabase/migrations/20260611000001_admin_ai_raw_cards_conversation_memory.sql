-- Admin AI raw cards + source-agnostic conversation memory.
--
-- Forward-only teardown of the derived CRM memory layer plus new append-only
-- conversation infrastructure for WhatsApp/chat evidence.

-- ---------------------------------------------------------------------------
-- Widen admin AI citation anchors.
-- ---------------------------------------------------------------------------

ALTER TABLE admin_ai_message_citations
  DROP CONSTRAINT IF EXISTS admin_ai_message_citations_source_type_check;

ALTER TABLE admin_ai_message_citations
  ADD CONSTRAINT admin_ai_message_citations_source_type_check
  CHECK (
    source_type IN (
      'application_answer',
      'application_structured_field',
      'contact_note',
      'contact_tag',
      'application_admin_note',
      'whatsapp_message',
      'conversation_fact'
    )
  );

-- ---------------------------------------------------------------------------
-- Raw conversation messages.
-- ---------------------------------------------------------------------------

CREATE TABLE conversation_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  source text NOT NULL CHECK (source IN ('whatsapp')),
  provider text NOT NULL CHECK (provider IN ('twilio')),
  provider_message_id text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_identifier text NOT NULL,
  to_identifier text NOT NULL,
  body text NOT NULL DEFAULT '',
  media_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  happened_at timestamptz NOT NULL,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  match_status text NOT NULL DEFAULT 'unmatched'
    CHECK (match_status IN ('matched', 'unmatched', 'ambiguous')),
  matched_via text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_message_id)
);

CREATE INDEX idx_conversation_messages_contact_time
  ON conversation_messages (contact_id, happened_at DESC)
  WHERE contact_id IS NOT NULL;

CREATE INDEX idx_conversation_messages_fts
  ON conversation_messages USING GIN (to_tsvector('english', body));

-- ---------------------------------------------------------------------------
-- Windowed digests, facts ledger, and message embeddings.
-- ---------------------------------------------------------------------------

CREATE TABLE conversation_digests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('whatsapp')),
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  first_message_id uuid NOT NULL REFERENCES conversation_messages(id) ON DELETE CASCADE,
  last_message_id uuid NOT NULL REFERENCES conversation_messages(id) ON DELETE CASCADE,
  summary text NOT NULL CHECK (btrim(summary) <> ''),
  source_message_count integer NOT NULL CHECK (source_message_count > 0),
  content_hash text NOT NULL UNIQUE,
  generator_model text NOT NULL,
  generator_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_conversation_digests_contact_window
  ON conversation_digests (contact_id, window_end DESC);

CREATE TABLE conversation_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('whatsapp')),
  field_key text,
  value_text text NOT NULL CHECK (btrim(value_text) <> ''),
  value_json jsonb,
  confidence text NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
  source_message_ids uuid[] NOT NULL,
  observed_at timestamptz NOT NULL,
  conflict_group text,
  invalidated_at timestamptz,
  extractor_model text NOT NULL,
  extractor_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_conversation_facts_contact_field_current
  ON conversation_facts (contact_id, field_key, observed_at DESC)
  WHERE invalidated_at IS NULL;

CREATE VIEW conversation_current_facts
WITH (security_invoker = true)
AS
SELECT DISTINCT ON (contact_id, field_key)
  *
FROM conversation_facts
WHERE invalidated_at IS NULL
ORDER BY contact_id, field_key, observed_at DESC, created_at DESC;

CREATE TABLE conversation_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type text NOT NULL CHECK (target_type IN ('message')),
  target_id uuid NOT NULL REFERENCES conversation_messages(id) ON DELETE CASCADE,
  embedding_model text NOT NULL,
  embedding_version text NOT NULL,
  content_hash text NOT NULL,
  embedding extensions.vector(1536) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (
    target_type,
    target_id,
    embedding_model,
    embedding_version,
    content_hash
  )
);

CREATE INDEX idx_conversation_embeddings_vector
  ON conversation_embeddings
  USING ivfflat (embedding extensions.vector_cosine_ops)
  WITH (lists = 100);

-- ---------------------------------------------------------------------------
-- Admin-readable RLS; service role writes bypass RLS.
-- ---------------------------------------------------------------------------

ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_digests ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read conversation messages" ON conversation_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can read conversation digests" ON conversation_digests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can read conversation facts" ON conversation_facts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can read conversation embeddings" ON conversation_embeddings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- ---------------------------------------------------------------------------
-- Conversation retrieval RPCs.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION search_conversation_embeddings(
  p_query_embedding extensions.vector(1536),
  p_contact_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 40
)
RETURNS TABLE (
  message_id uuid,
  contact_id uuid,
  body text,
  happened_at timestamptz,
  similarity double precision
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    message.id AS message_id,
    message.contact_id,
    message.body,
    message.happened_at,
    1 - (embedding.embedding OPERATOR(extensions.<=>) p_query_embedding) AS similarity
  FROM conversation_embeddings embedding
  JOIN conversation_messages message
    ON message.id = embedding.target_id
  WHERE embedding.target_type = 'message'
    AND (p_contact_id IS NULL OR message.contact_id = p_contact_id)
  ORDER BY embedding.embedding OPERATOR(extensions.<=>) p_query_embedding
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION search_conversation_messages_fts(
  p_query text,
  p_contact_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 40
)
RETURNS TABLE (
  message_id uuid,
  contact_id uuid,
  body text,
  happened_at timestamptz,
  rank double precision
)
LANGUAGE sql
STABLE
AS $$
  WITH query AS (
    SELECT websearch_to_tsquery('english', coalesce(p_query, '')) AS tsq
  )
  SELECT
    message.id AS message_id,
    message.contact_id,
    message.body,
    message.happened_at,
    ts_rank_cd(to_tsvector('english', message.body), query.tsq) AS rank
  FROM conversation_messages message, query
  WHERE (p_contact_id IS NULL OR message.contact_id = p_contact_id)
    AND (
      coalesce(p_query, '') = ''
      OR to_tsvector('english', message.body) @@ query.tsq
    )
  ORDER BY rank DESC, message.happened_at DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION search_conversation_embeddings(extensions.vector(1536), uuid, integer)
  TO authenticated;
GRANT EXECUTE ON FUNCTION search_conversation_messages_fts(text, uuid, integer)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- Drop obsolete derived CRM memory layer. Keep the vector extension.
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS crm_ai_evidence_chunks_set_updated_at_trg
  ON crm_ai_evidence_chunks;
DROP FUNCTION IF EXISTS crm_ai_evidence_chunks_set_updated_at();
DROP FUNCTION IF EXISTS search_admin_ai_subchunk_evidence(extensions.vector(1536), uuid[], uuid, integer);
DROP FUNCTION IF EXISTS find_stale_admin_ai_contact_memory(integer);
DROP FUNCTION IF EXISTS search_admin_ai_chunk_evidence(text, uuid[], uuid, integer);

DROP TABLE IF EXISTS crm_ai_embeddings CASCADE;
DROP TABLE IF EXISTS crm_ai_fact_observations CASCADE;
DROP TABLE IF EXISTS crm_ai_evidence_subchunks CASCADE;
DROP TABLE IF EXISTS crm_ai_evidence_chunks CASCADE;
DROP TABLE IF EXISTS crm_ai_contact_dossiers CASCADE;
