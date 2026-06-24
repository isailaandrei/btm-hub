-- Retry must produce a fresh provider idempotency key.
--
-- The Brevo idempotency key is scoped per attempt (`<recipientId>:<send_attempts>`),
-- so a retry only re-delivers if send_attempts changes. Previously the requeue
-- reset send_attempts to 0, which — combined with the claim incrementing it back
-- to 1 — reused the original attempt's key, and Brevo rejected the resend with
-- "Email for the idempotency key has already been processed". Keep the existing
-- attempt count so the next claim yields a higher number → a new key.
CREATE OR REPLACE FUNCTION requeue_failed_email_recipients(
  p_send_id uuid
) RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE email_send_recipients
  SET
    status = 'queued',
    last_error = NULL,
    sending_started_at = NULL,
    queued_at = now(),
    updated_at = now()
  WHERE send_id = p_send_id
    AND status = 'failed';

  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count > 0 THEN
    UPDATE email_sends
    SET status = 'queued', updated_at = now()
    WHERE id = p_send_id;
  END IF;

  RETURN v_count;
END;
$$;
