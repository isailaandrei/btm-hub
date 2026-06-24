-- Deferred-state plumbing + a scoped retry for failed recipients.
--
-- Depends on the 'deferred' enum value added in 20260624000001 (committed first).

-- 1. Columns -----------------------------------------------------------------
ALTER TABLE email_send_recipients
  ADD COLUMN IF NOT EXISTS deferred_at timestamptz;

ALTER TABLE email_sends
  ADD COLUMN IF NOT EXISTS deferred_count integer NOT NULL DEFAULT 0;

-- 2. Provider-event application ----------------------------------------------
-- Rewrite so that:
--   * a soft bounce / deferral lands on the transient 'deferred' status, and
--   * a later positive signal (delivered / opened / clicked) OVERRIDES a prior
--     'deferred' or 'failed' — fixing the old "sticky failed" bug where a
--     recipient that Brevo eventually delivered to stayed marked Failed forever.
-- Terminal signals (complained, hard bounce, unsubscribe, skips) still win.
CREATE OR REPLACE FUNCTION apply_email_provider_event(
  p_provider text,
  p_provider_message_id text,
  p_status email_recipient_status,
  p_timestamp_field text,
  p_occurred_at timestamptz
) RETURNS email_send_recipients
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_recipient email_send_recipients;
BEGIN
  UPDATE email_send_recipients r
  SET
    delivered_at = CASE
      WHEN p_timestamp_field IN ('delivered_at', 'opened_at', 'clicked_at') THEN coalesce(r.delivered_at, p_occurred_at)
      ELSE r.delivered_at
    END,
    opened_at = CASE
      WHEN p_timestamp_field = 'opened_at' THEN coalesce(r.opened_at, p_occurred_at)
      ELSE r.opened_at
    END,
    clicked_at = CASE
      WHEN p_timestamp_field = 'clicked_at' THEN coalesce(r.clicked_at, p_occurred_at)
      ELSE r.clicked_at
    END,
    deferred_at = CASE
      WHEN p_timestamp_field = 'deferred_at' THEN coalesce(r.deferred_at, p_occurred_at)
      ELSE r.deferred_at
    END,
    bounced_at = CASE
      WHEN p_timestamp_field = 'bounced_at' THEN coalesce(r.bounced_at, p_occurred_at)
      ELSE r.bounced_at
    END,
    complained_at = CASE
      WHEN p_timestamp_field = 'complained_at' THEN coalesce(r.complained_at, p_occurred_at)
      ELSE r.complained_at
    END,
    unsubscribed_at = CASE
      WHEN p_timestamp_field = 'unsubscribed_at' THEN coalesce(r.unsubscribed_at, p_occurred_at)
      ELSE r.unsubscribed_at
    END,
    status = CASE
      -- Strongest terminal signals first.
      WHEN p_status = 'complained' THEN 'complained'::email_recipient_status
      WHEN r.status = 'complained' THEN 'complained'::email_recipient_status
      WHEN p_status = 'bounced' THEN 'bounced'::email_recipient_status
      WHEN r.status = 'bounced' THEN 'bounced'::email_recipient_status
      -- Explicit opt-outs / skips are never overwritten by later delivery noise.
      WHEN r.status IN ('unsubscribed', 'skipped_unsubscribed', 'skipped_suppressed') THEN r.status
      WHEN p_status = 'unsubscribed' THEN 'unsubscribed'::email_recipient_status
      -- Positive engagement is ground truth: it overrides a prior deferred/failed.
      WHEN p_status = 'clicked' THEN 'clicked'::email_recipient_status
      WHEN r.status = 'clicked' THEN 'clicked'::email_recipient_status
      WHEN p_status = 'delivered' THEN 'delivered'::email_recipient_status
      WHEN r.status = 'delivered' THEN 'delivered'::email_recipient_status
      -- Genuine, likely-permanent failure (Brevo blocked / error).
      WHEN p_status = 'failed' THEN 'failed'::email_recipient_status
      -- Transient: a soft bounce / deferral, only from a not-yet-delivered state.
      WHEN p_status = 'deferred'
        AND r.status IN ('pending', 'queued', 'sending', 'sent', 'failed', 'deferred')
        THEN 'deferred'::email_recipient_status
      WHEN p_status = 'sent' AND r.status IN ('pending', 'queued', 'sending') THEN 'sent'::email_recipient_status
      ELSE r.status
    END,
    updated_at = now()
  WHERE r.provider = p_provider
    AND r.provider_message_id = p_provider_message_id
  RETURNING * INTO v_recipient;

  RETURN v_recipient;
END;
$$;

-- 3. Send-level counts -------------------------------------------------------
-- Add deferred_count; failed_count now reflects only genuine failures (soft
-- bounces no longer inflate it).
CREATE OR REPLACE FUNCTION update_email_send_counts(
  p_send_id uuid
) RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_counts record;
  v_terminal boolean;
BEGIN
  SELECT
    count(*) FILTER (WHERE status NOT IN ('skipped_unsubscribed', 'skipped_suppressed')) AS recipient_count,
    count(*) FILTER (WHERE status IN ('skipped_unsubscribed', 'skipped_suppressed')) AS skipped_count,
    count(*) FILTER (WHERE sent_at IS NOT NULL) AS sent_count,
    count(*) FILTER (WHERE delivered_at IS NOT NULL) AS delivered_count,
    count(*) FILTER (WHERE opened_at IS NOT NULL) AS opened_count,
    count(*) FILTER (WHERE clicked_at IS NOT NULL) AS clicked_count,
    count(*) FILTER (WHERE bounced_at IS NOT NULL OR status = 'bounced') AS bounced_count,
    count(*) FILTER (WHERE complained_at IS NOT NULL OR status = 'complained') AS complained_count,
    count(*) FILTER (WHERE status = 'failed') AS failed_count,
    count(*) FILTER (WHERE status = 'deferred' AND delivered_at IS NULL) AS deferred_count,
    count(*) FILTER (WHERE unsubscribed_at IS NOT NULL OR status = 'unsubscribed') AS unsubscribed_count,
    count(*) FILTER (WHERE status IN ('pending', 'queued', 'sending')) = 0 AS terminal
  INTO v_counts
  FROM email_send_recipients
  WHERE send_id = p_send_id;

  v_terminal := coalesce(v_counts.terminal, true);

  UPDATE email_sends
  SET
    recipient_count = coalesce(v_counts.recipient_count, 0),
    skipped_count = coalesce(v_counts.skipped_count, 0),
    sent_count = coalesce(v_counts.sent_count, 0),
    delivered_count = coalesce(v_counts.delivered_count, 0),
    opened_count = coalesce(v_counts.opened_count, 0),
    clicked_count = coalesce(v_counts.clicked_count, 0),
    bounced_count = coalesce(v_counts.bounced_count, 0),
    complained_count = coalesce(v_counts.complained_count, 0),
    failed_count = coalesce(v_counts.failed_count, 0),
    deferred_count = coalesce(v_counts.deferred_count, 0),
    unsubscribed_count = coalesce(v_counts.unsubscribed_count, 0),
    status = CASE
      WHEN NOT v_terminal THEN status
      WHEN coalesce(v_counts.failed_count, 0) > 0 AND coalesce(v_counts.sent_count, 0) = 0 THEN 'failed'::email_send_status
      WHEN coalesce(v_counts.failed_count, 0) > 0 THEN 'partially_failed'::email_send_status
      WHEN coalesce(v_counts.recipient_count, 0) = 0 THEN 'sent'::email_send_status
      ELSE 'sent'::email_send_status
    END,
    updated_at = now()
  WHERE id = p_send_id;
END;
$$;

-- 4. Scoped retry ------------------------------------------------------------
-- Re-queue ONLY genuinely-failed recipients (status = 'failed': Brevo
-- blocked/error or a send-time error). Deliberately excludes:
--   * 'deferred'  — Brevo is still retrying; resending would duplicate.
--   * 'bounced'   — hard bounce, permanent (and already suppressed).
--   * 'complained' / 'unsubscribed' / 'skipped_*' — must not be re-contacted.
-- Suppression is re-checked when the recipient is re-claimed for sending, so a
-- contact suppressed since the original send is skipped rather than re-sent.
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
    send_attempts = 0,
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
