-- Email reliability fixes:
--   1. mark_email_recipient_sent          — send-path status update that never
--                                            downgrades a webhook-advanced status.
--   2. apply_email_provider_event_by_recipient — apply a provider event matched by
--                                            recipient id (deterministic; fixes the
--                                            delivered-webhook race) and backfill the
--                                            provider_message_id if the send-path
--                                            hasn't written it yet.
--   3. reconcile_orphan_email_events       — backstop: re-link events that landed
--                                            with no recipient and re-apply them.
--   4. email_sends_needing_processing      — cron drainer: sends with unsent /
--                                            stalled recipients that need another pass.

-- 1. Send-path "sent" writer. Identical effect to the previous PostgREST update,
-- EXCEPT the status only advances pending/queued/sending -> sent. If a delivery
-- webhook already won the race and advanced the recipient (delivered/opened/
-- clicked/bounced/...), that status is preserved instead of being clobbered back
-- to 'sent'. provider_message_id is always (re)written so later/earlier webhooks
-- can match by it.
CREATE OR REPLACE FUNCTION public.mark_email_recipient_sent(
  p_recipient_id uuid,
  p_provider text,
  p_provider_message_id text,
  p_provider_metadata jsonb,
  p_rendered_subject text,
  p_rendered_html text,
  p_rendered_text text,
  p_unsubscribe_token_hash text,
  p_last_error text DEFAULT NULL
)
RETURNS email_send_recipients
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_row email_send_recipients;
BEGIN
  UPDATE email_send_recipients r
  SET
    provider = p_provider,
    provider_message_id = p_provider_message_id,
    provider_metadata = coalesce(r.provider_metadata, '{}'::jsonb) || coalesce(p_provider_metadata, '{}'::jsonb),
    rendered_subject = coalesce(p_rendered_subject, r.rendered_subject),
    rendered_html = coalesce(p_rendered_html, r.rendered_html),
    rendered_text = coalesce(p_rendered_text, r.rendered_text),
    unsubscribe_token_hash = coalesce(p_unsubscribe_token_hash, r.unsubscribe_token_hash),
    sent_at = coalesce(r.sent_at, now()),
    last_error = p_last_error,
    status = CASE
      WHEN r.status IN ('pending', 'queued', 'sending') THEN 'sent'::email_recipient_status
      ELSE r.status
    END,
    updated_at = now()
  WHERE r.id = p_recipient_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;

-- 2. Apply a provider event matched by recipient id (not by provider_message_id).
-- The webhook handler uses this whenever the event carries our X-Mailin-custom
-- recipientId, so a delivery/engagement event can land even if the send-path
-- hasn't persisted the provider_message_id yet. Status precedence is identical to
-- apply_email_provider_event.
CREATE OR REPLACE FUNCTION public.apply_email_provider_event_by_recipient(
  p_recipient_id uuid,
  p_provider text,
  p_provider_message_id text,
  p_status email_recipient_status,
  p_timestamp_field text,
  p_occurred_at timestamptz
)
RETURNS email_send_recipients
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_recipient email_send_recipients;
BEGIN
  UPDATE email_send_recipients r
  SET
    -- Backfill identifiers if the send-path hasn't written them yet (the race).
    provider = coalesce(r.provider, p_provider),
    provider_message_id = coalesce(r.provider_message_id, p_provider_message_id),
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
$function$;

-- 3. Backstop sweep. Re-links any event that landed without a recipient
-- (recipient_id IS NULL) using our X-Mailin-custom metadata, re-applies it to the
-- recipient, and refreshes the affected sends' counts. Returns the number of
-- events reconciled. Safe to run repeatedly.
CREATE OR REPLACE FUNCTION public.reconcile_orphan_email_events(p_limit int DEFAULT 500)
RETURNS int
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  e record;
  v_rid uuid;
  v_sid uuid;
  v_cid uuid;
  v_field text;
  v_status email_recipient_status;
  v_count int := 0;
  v_send_ids uuid[] := '{}';
  v_send uuid;
BEGIN
  FOR e IN
    SELECT id, type, occurred_at, provider, provider_message_id, payload
    FROM email_events
    WHERE recipient_id IS NULL
      AND type IN ('delivered', 'opened', 'clicked', 'bounced', 'complained', 'unsubscribed', 'delivery_delayed')
      AND (payload ->> 'X-Mailin-custom') ~ '"recipientId"'
    ORDER BY occurred_at
    LIMIT greatest(p_limit, 1)
  LOOP
    BEGIN
      v_rid := nullif((e.payload ->> 'X-Mailin-custom')::jsonb ->> 'recipientId', '')::uuid;
    EXCEPTION WHEN others THEN
      v_rid := NULL;
    END;
    IF v_rid IS NULL OR NOT EXISTS (SELECT 1 FROM email_send_recipients WHERE id = v_rid) THEN
      CONTINUE;
    END IF;

    BEGIN v_sid := nullif((e.payload ->> 'X-Mailin-custom')::jsonb ->> 'sendId', '')::uuid; EXCEPTION WHEN others THEN v_sid := NULL; END;
    BEGIN v_cid := nullif((e.payload ->> 'X-Mailin-custom')::jsonb ->> 'contactId', '')::uuid; EXCEPTION WHEN others THEN v_cid := NULL; END;

    UPDATE email_events
    SET recipient_id = v_rid,
        send_id = coalesce(send_id, v_sid),
        contact_id = coalesce(contact_id, v_cid)
    WHERE id = e.id;

    v_field := CASE e.type
      WHEN 'delivered' THEN 'delivered_at'
      WHEN 'opened' THEN 'opened_at'
      WHEN 'clicked' THEN 'clicked_at'
      WHEN 'delivery_delayed' THEN 'deferred_at'
      WHEN 'bounced' THEN 'bounced_at'
      WHEN 'complained' THEN 'complained_at'
      WHEN 'unsubscribed' THEN 'unsubscribed_at'
    END;
    v_status := CASE e.type
      WHEN 'delivered' THEN 'delivered'
      WHEN 'opened' THEN 'delivered'
      WHEN 'clicked' THEN 'clicked'
      WHEN 'delivery_delayed' THEN 'deferred'
      WHEN 'bounced' THEN 'bounced'
      WHEN 'complained' THEN 'complained'
      WHEN 'unsubscribed' THEN 'unsubscribed'
    END::email_recipient_status;

    PERFORM apply_email_provider_event_by_recipient(
      v_rid,
      coalesce(e.provider, 'brevo'),
      e.provider_message_id,
      v_status,
      v_field,
      e.occurred_at
    );

    SELECT send_id INTO v_send FROM email_send_recipients WHERE id = v_rid;
    IF v_send IS NOT NULL AND NOT (v_send = ANY (v_send_ids)) THEN
      v_send_ids := array_append(v_send_ids, v_send);
    END IF;

    v_count := v_count + 1;
  END LOOP;

  FOREACH v_send IN ARRAY v_send_ids LOOP
    PERFORM update_email_send_counts(v_send);
  END LOOP;

  RETURN v_count;
END;
$function$;

-- 4. Cron drainer source: sends still in flight that have recipients which never
-- went out (pending/queued) or are stalled mid-send (claimed > 15 min ago with no
-- provider_message_id). These need another processing pass to finish.
CREATE OR REPLACE FUNCTION public.email_sends_needing_processing(p_limit int DEFAULT 25)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT DISTINCT r.send_id
  FROM email_send_recipients r
  JOIN email_sends s ON s.id = r.send_id
  WHERE s.status IN ('queued', 'sending')
    AND (
      r.status IN ('pending', 'queued')
      OR (
        r.status = 'sending'
        AND r.provider_message_id IS NULL
        AND r.sending_started_at < now() - interval '15 minutes'
      )
    )
  LIMIT greatest(p_limit, 1);
$function$;
