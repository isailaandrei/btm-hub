-- Watermark-aware conversation scheduling helpers.

CREATE OR REPLACE FUNCTION list_undigested_conversation_messages(
  p_limit integer DEFAULT 500
)
RETURNS TABLE (
  id uuid,
  contact_id uuid,
  body text,
  happened_at timestamptz
)
LANGUAGE sql
STABLE
AS $$
  WITH digest_watermarks AS (
    SELECT
      contact_id,
      max(window_end) AS latest_window_end
    FROM conversation_digests
    GROUP BY contact_id
  )
  SELECT
    message.id,
    message.contact_id,
    message.body,
    message.happened_at
  FROM conversation_messages message
  LEFT JOIN digest_watermarks watermark
    ON watermark.contact_id = message.contact_id
  WHERE message.contact_id IS NOT NULL
    AND (
      watermark.latest_window_end IS NULL
      OR message.happened_at > watermark.latest_window_end
    )
  ORDER BY message.happened_at ASC, message.id ASC
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION list_conversation_messages_missing_embeddings(
  p_embedding_model text,
  p_embedding_version text,
  p_limit integer DEFAULT 500
)
RETURNS TABLE (
  id uuid,
  body text
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    message.id,
    message.body
  FROM conversation_messages message
  WHERE NOT EXISTS (
    SELECT 1
    FROM conversation_embeddings embedding
    WHERE embedding.target_type = 'message'
      AND embedding.target_id = message.id
      AND embedding.embedding_model = p_embedding_model
      AND embedding.embedding_version = p_embedding_version
  )
  ORDER BY message.happened_at ASC, message.id ASC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION list_undigested_conversation_messages(integer)
  TO authenticated;
GRANT EXECUTE ON FUNCTION list_conversation_messages_missing_embeddings(text, text, integer)
  TO authenticated;
