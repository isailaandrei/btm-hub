-- Two correctness fixes for email engagement metrics:
--
-- 1. CLICK IMPLIES OPEN. A click is strong evidence of a human open — far
--    stronger than a tracking-pixel fetch (the only caveat being automated link
--    scanners, e.g. corporate security gateways, which can click without a
--    human; negligible for this consumer audience). Brevo may report a click
--    WITHOUT a preceding open (the open was masked by a privacy proxy, or the
--    open pixel was blocked while the link still resolved). We were counting
--    those recipients as clicked-but-not-opened, undercounting opens. The
--    apply_* RPCs now backfill opened_at whenever clicked_at is set.
--
-- 2. PROXY OPENS TRACKED SEPARATELY. Brevo's "loaded by proxy" event (Apple Mail
--    Privacy Protection et al.) was received by our webhook (we subscribe to
--    uniqueProxyOpen) and then silently dropped. It is not a confirmed human
--    open, so we keep it OUT of opened_count, but we now persist it as
--    proxy_opened_at / proxy_opened_count so admins get an honest "optimistic"
--    upper bound instead of throwing the signal away.
--
-- Depends on the 'proxy_opened' enum value added in 20260624000006.

-- 1. Columns -----------------------------------------------------------------
ALTER TABLE email_send_recipients
  ADD COLUMN IF NOT EXISTS proxy_opened_at timestamptz;

ALTER TABLE email_sends
  ADD COLUMN IF NOT EXISTS proxy_opened_count integer NOT NULL DEFAULT 0;

-- 2. apply_email_provider_event ---------------------------------------------
-- Identical to 20260624000002 EXCEPT opened_at is now also set when the event is
-- a click (click implies open).
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
    -- Click implies open: a click backfills opened_at too.
    opened_at = CASE
      WHEN p_timestamp_field IN ('opened_at', 'clicked_at') THEN coalesce(r.opened_at, p_occurred_at)
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
      WHEN p_status = 'complained' THEN 'complained'::email_recipient_status
      WHEN r.status = 'complained' THEN 'complained'::email_recipient_status
      WHEN p_status = 'bounced' THEN 'bounced'::email_recipient_status
      WHEN r.status = 'bounced' THEN 'bounced'::email_recipient_status
      WHEN r.status IN ('unsubscribed', 'skipped_unsubscribed', 'skipped_suppressed') THEN r.status
      WHEN p_status = 'unsubscribed' THEN 'unsubscribed'::email_recipient_status
      WHEN p_status = 'clicked' THEN 'clicked'::email_recipient_status
      WHEN r.status = 'clicked' THEN 'clicked'::email_recipient_status
      WHEN p_status = 'delivered' THEN 'delivered'::email_recipient_status
      WHEN r.status = 'delivered' THEN 'delivered'::email_recipient_status
      WHEN p_status = 'failed' THEN 'failed'::email_recipient_status
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

-- 3. apply_email_provider_event_by_recipient --------------------------------
-- Same click-implies-open change, on the recipient-id (race-proof) variant.
CREATE OR REPLACE FUNCTION apply_email_provider_event_by_recipient(
  p_recipient_id uuid,
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
    provider = coalesce(r.provider, p_provider),
    provider_message_id = coalesce(r.provider_message_id, p_provider_message_id),
    delivered_at = CASE
      WHEN p_timestamp_field IN ('delivered_at', 'opened_at', 'clicked_at') THEN coalesce(r.delivered_at, p_occurred_at)
      ELSE r.delivered_at
    END,
    -- Click implies open: a click backfills opened_at too.
    opened_at = CASE
      WHEN p_timestamp_field IN ('opened_at', 'clicked_at') THEN coalesce(r.opened_at, p_occurred_at)
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
      WHEN p_status = 'complained' THEN 'complained'::email_recipient_status
      WHEN r.status = 'complained' THEN 'complained'::email_recipient_status
      WHEN p_status = 'bounced' THEN 'bounced'::email_recipient_status
      WHEN r.status = 'bounced' THEN 'bounced'::email_recipient_status
      WHEN r.status IN ('unsubscribed', 'skipped_unsubscribed', 'skipped_suppressed') THEN r.status
      WHEN p_status = 'unsubscribed' THEN 'unsubscribed'::email_recipient_status
      WHEN p_status = 'clicked' THEN 'clicked'::email_recipient_status
      WHEN r.status = 'clicked' THEN 'clicked'::email_recipient_status
      WHEN p_status = 'delivered' THEN 'delivered'::email_recipient_status
      WHEN r.status = 'delivered' THEN 'delivered'::email_recipient_status
      WHEN p_status = 'failed' THEN 'failed'::email_recipient_status
      WHEN p_status = 'deferred'
        AND r.status IN ('pending', 'queued', 'sending', 'sent', 'failed', 'deferred')
        THEN 'deferred'::email_recipient_status
      WHEN p_status = 'sent' AND r.status IN ('pending', 'queued', 'sending') THEN 'sent'::email_recipient_status
      ELSE r.status
    END,
    updated_at = now()
  WHERE r.id = p_recipient_id
  RETURNING * INTO v_recipient;

  RETURN v_recipient;
END;
$$;

-- 4. Proxy-open application --------------------------------------------------
-- Proxy opens set proxy_opened_at ONLY — never a status, never opened_at — so
-- they can't be mistaken for a confirmed human open. A proxy fetch does imply the
-- message reached the recipient's mail system, so delivered_at is backfilled.
--
-- NOTE: proxy opens are deliberately NOT handled by reconcile_orphan_email_events
-- (20260624000005). proxy_opened_count is an explicitly optimistic, display-only
-- metric, and the webhook's recipientId-metadata path (X-Mailin-custom, set on
-- every send) matches virtually all events — so a proxy open landing orphaned is
-- a rare, best-effort loss, not a correctness gap. Intentional, not an oversight.
CREATE OR REPLACE FUNCTION apply_email_proxy_open(
  p_provider text,
  p_provider_message_id text,
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
    delivered_at = coalesce(r.delivered_at, p_occurred_at),
    proxy_opened_at = coalesce(r.proxy_opened_at, p_occurred_at),
    updated_at = now()
  WHERE r.provider = p_provider
    AND r.provider_message_id = p_provider_message_id
  RETURNING * INTO v_recipient;

  RETURN v_recipient;
END;
$$;

CREATE OR REPLACE FUNCTION apply_email_proxy_open_by_recipient(
  p_recipient_id uuid,
  p_provider text,
  p_provider_message_id text,
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
    -- Backfill identifiers if the send-path hasn't written them yet (the race).
    provider = coalesce(r.provider, p_provider),
    provider_message_id = coalesce(r.provider_message_id, p_provider_message_id),
    delivered_at = coalesce(r.delivered_at, p_occurred_at),
    proxy_opened_at = coalesce(r.proxy_opened_at, p_occurred_at),
    updated_at = now()
  WHERE r.id = p_recipient_id
  RETURNING * INTO v_recipient;

  RETURN v_recipient;
END;
$$;

-- 5. Send-level counts ------------------------------------------------------
-- Adds proxy_opened_count: recipients whose ONLY open signal is a privacy-proxy
-- fetch (proxy_opened_at set, opened_at null). Defined as net-additional so the
-- UI can show an honest range — opened_count (certain) .. opened_count +
-- proxy_opened_count (optimistic upper bound) — with no double counting.
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
    count(*) FILTER (WHERE proxy_opened_at IS NOT NULL AND opened_at IS NULL) AS proxy_opened_count,
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
    proxy_opened_count = coalesce(v_counts.proxy_opened_count, 0),
    clicked_count = coalesce(v_counts.clicked_count, 0),
    bounced_count = coalesce(v_counts.bounced_count, 0),
    complained_count = coalesce(v_counts.complained_count, 0),
    failed_count = coalesce(v_counts.failed_count, 0),
    deferred_count = coalesce(v_counts.deferred_count, 0),
    unsubscribed_count = coalesce(v_counts.unsubscribed_count, 0),
    status = CASE
      -- A recompute must never advance a draft. A draft can have recipient rows
      -- on disk (created with the send) that are all skipped/suppressed, making it
      -- "terminal" with recipient_count = 0 — without this guard the blanket
      -- recompute below would silently flip such a draft to 'sent'. Drafts only
      -- leave 'draft' via the explicit queue/send actions.
      WHEN status = 'draft' THEN status
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

-- 6. Backfill ---------------------------------------------------------------
-- Click-implies-open for history: any recipient that clicked but has no recorded
-- open gets opened_at set to its click time (a lower bound on the real open).
UPDATE email_send_recipients
SET opened_at = clicked_at, updated_at = now()
WHERE clicked_at IS NOT NULL AND opened_at IS NULL;

-- Recompute every send's counters so opened_count (and the new proxy_opened_count
-- column default) reflect the backfill. Proxy opens themselves cannot be
-- recovered for past sends — those events were dropped before this change — so
-- historical proxy_opened_count stays 0; it populates from new sends onward.
DO $$
DECLARE
  v_send_id uuid;
BEGIN
  FOR v_send_id IN SELECT DISTINCT send_id FROM email_send_recipients LOOP
    PERFORM update_email_send_counts(v_send_id);
  END LOOP;
END $$;
