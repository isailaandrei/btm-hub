-- Conversation card quality follow-up.
--
-- Keep digest transcripts attributable by returning direction from the
-- undigested-message scheduler. Drop the unused current-facts view because
-- the raw-card path intentionally reads the append-only fact ledger to surface
-- conflicts instead of collapsing to one current value per field.

DROP FUNCTION IF EXISTS list_undigested_conversation_messages(integer);

CREATE FUNCTION list_undigested_conversation_messages(
  p_limit integer DEFAULT 500
)
RETURNS TABLE (
  id uuid,
  contact_id uuid,
  direction text,
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
    message.direction,
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

GRANT EXECUTE ON FUNCTION list_undigested_conversation_messages(integer)
  TO authenticated;

DROP VIEW IF EXISTS conversation_current_facts;
