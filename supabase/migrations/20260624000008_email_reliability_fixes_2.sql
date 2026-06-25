-- Follow-up email-reliability fixes (from an independent audit of 20260624000005):
--   1. STABLE per-dispatch idempotency key (BLOCKER): the previous per-attempt key
--      hash(recipientId:send_attempts) changed when a stalled 'sending' row was
--      re-claimed (send_attempts bumped), so re-sending a recipient Brevo had
--      already accepted/delivered produced a NEW key -> Brevo did not dedupe ->
--      the person was emailed twice. The every-minute drain would make this
--      systematic. Fix: assign the key once at claim time, preserve it across a
--      stalled re-claim (so a re-send dedupes), and clear it only on an intentional
--      retry of a failed recipient (so that genuinely re-sends).
--   2. reconcile_orphan_email_events: cover 'failed' events and replicate the
--      webhook's suppression / opt-out side-effects for bounced/complained/
--      unsubscribed orphans (otherwise a raced bounce/complaint stays sendable).
--   3. mark_email_recipient_sent: never clobber a webhook-advanced status's
--      last_error, and never repoint its provider_message_id.
--   4. claim stalled-recovery + email_sends_needing_processing: NULL-safe on
--      sending_started_at (a 'sending' row with NULL start was invisible forever).

-- 1a. Per-dispatch idempotency key.
ALTER TABLE email_send_recipients ADD COLUMN IF NOT EXISTS idempotency_key text;

-- 1b + 4. Claim: assign/preserve the key; NULL-safe stalled recovery.
CREATE OR REPLACE FUNCTION public.claim_queued_email_recipients(p_send_id uuid, p_limit integer DEFAULT 25)
 RETURNS SETOF email_send_recipients
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE email_sends
  SET status = 'sending', updated_at = now()
  WHERE id = p_send_id
    AND status IN ('queued', 'sending');

  UPDATE email_send_recipients r
  SET status = 'skipped_suppressed', skip_reason = 'suppressed', updated_at = now()
  WHERE r.send_id = p_send_id
    AND r.status = 'queued'
    AND EXISTS (
      SELECT 1 FROM email_suppressions s
      WHERE s.lifted_at IS NULL
        AND (s.email = r.email OR (s.contact_id IS NOT NULL AND s.contact_id = r.contact_id))
    );

  UPDATE email_send_recipients r
  SET status = 'skipped_unsubscribed', skip_reason = 'newsletter_unsubscribed', updated_at = now()
  FROM email_sends s
  WHERE s.id = p_send_id
    AND s.kind = 'broadcast'
    AND r.send_id = p_send_id
    AND r.status = 'queued'
    AND EXISTS (
      SELECT 1 FROM contact_email_preferences p
      WHERE p.contact_id = r.contact_id
        AND p.newsletter_unsubscribed_at IS NOT NULL
    );

  -- Stalled recovery: re-queue rows claimed but never completed (NULL-safe).
  UPDATE email_send_recipients
  SET status = CASE WHEN send_attempts < 3 THEN 'queued'::email_recipient_status ELSE 'failed'::email_recipient_status END,
      last_error = CASE WHEN send_attempts < 3 THEN last_error ELSE coalesce(last_error, 'Email send timed out while sending') END,
      sending_started_at = NULL,
      queued_at = CASE WHEN send_attempts < 3 THEN now() ELSE queued_at END,
      updated_at = now()
  WHERE send_id = p_send_id
    AND status = 'sending'
    AND provider_message_id IS NULL
    AND (sending_started_at IS NULL OR sending_started_at < now() - interval '15 minutes');

  RETURN QUERY
  WITH claimed AS (
    SELECT id
    FROM email_send_recipients
    WHERE send_id = p_send_id
      AND status = 'queued'
    ORDER BY created_at, id
    FOR UPDATE SKIP LOCKED
    LIMIT greatest(p_limit, 1)
  )
  UPDATE email_send_recipients r
  SET status = 'sending',
      sending_started_at = now(),
      send_attempts = r.send_attempts + 1,
      -- Assign once, preserve across re-claims. A stalled re-send reuses the SAME
      -- Brevo idempotency key so Brevo dedupes if the first attempt already went out.
      idempotency_key = coalesce(r.idempotency_key, gen_random_uuid()::text),
      updated_at = now()
  FROM claimed
  WHERE r.id = claimed.id
  RETURNING r.*;
END;
$function$;

-- 1c. Requeue (intentional retry of a failed recipient): clear the key so the next
-- claim assigns a fresh one and Brevo re-sends instead of deduping the prior failure.
CREATE OR REPLACE FUNCTION public.requeue_failed_email_recipients(p_send_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  UPDATE email_send_recipients
  SET status = 'queued',
      last_error = NULL,
      sending_started_at = NULL,
      idempotency_key = NULL,
      queued_at = now(),
      updated_at = now()
  WHERE send_id = p_send_id
    AND status = 'failed';

  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count > 0 THEN
    UPDATE email_sends SET status = 'queued', updated_at = now() WHERE id = p_send_id;
  END IF;

  RETURN v_count;
END;
$function$;

-- 3. Send-path "sent" writer: no-downgrade AND no-clobber of webhook-recorded data.
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
    -- Don't repoint a delivered recipient's msgid at a different message (keep the
    -- one a webhook already matched/backfilled); only fill it when still null.
    provider_message_id = coalesce(r.provider_message_id, p_provider_message_id),
    provider_metadata = coalesce(r.provider_metadata, '{}'::jsonb) || coalesce(p_provider_metadata, '{}'::jsonb),
    rendered_subject = coalesce(p_rendered_subject, r.rendered_subject),
    rendered_html = coalesce(p_rendered_html, r.rendered_html),
    rendered_text = coalesce(p_rendered_text, r.rendered_text),
    unsubscribe_token_hash = coalesce(p_unsubscribe_token_hash, r.unsubscribe_token_hash),
    sent_at = coalesce(r.sent_at, now()),
    -- Don't erase a webhook diagnostic (e.g. a bounce reason) on a late send write.
    last_error = CASE WHEN r.status IN ('pending', 'queued', 'sending') THEN p_last_error ELSE r.last_error END,
    status = CASE WHEN r.status IN ('pending', 'queued', 'sending') THEN 'sent'::email_recipient_status ELSE r.status END,
    updated_at = now()
  WHERE r.id = p_recipient_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;

-- 4b. Drain source: NULL-safe stalled detection.
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
        AND (r.sending_started_at IS NULL OR r.sending_started_at < now() - interval '15 minutes')
      )
    )
  LIMIT greatest(p_limit, 1);
$function$;

-- 2. Backstop sweep: + 'failed', + suppression/opt-out side-effects.
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
  v_email text;
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
      AND type IN ('delivered', 'opened', 'clicked', 'bounced', 'complained', 'unsubscribed', 'delivery_delayed', 'failed')
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
      WHEN 'failed' THEN 'bounced_at'
    END;
    v_status := CASE e.type
      WHEN 'delivered' THEN 'delivered'
      WHEN 'opened' THEN 'delivered'
      WHEN 'clicked' THEN 'clicked'
      WHEN 'delivery_delayed' THEN 'deferred'
      WHEN 'bounced' THEN 'bounced'
      WHEN 'complained' THEN 'complained'
      WHEN 'unsubscribed' THEN 'unsubscribed'
      WHEN 'failed' THEN 'failed'
    END::email_recipient_status;

    PERFORM apply_email_provider_event_by_recipient(
      v_rid, coalesce(e.provider, 'brevo'), e.provider_message_id, v_status, v_field, e.occurred_at
    );

    -- Replicate the webhook's suppression / opt-out side-effects so a raced
    -- bounce/complaint/unsubscribe doesn't leave the address sendable. Guarded by
    -- the active-email partial unique index (NOT EXISTS).
    SELECT email, contact_id INTO v_email, v_cid FROM email_send_recipients WHERE id = v_rid;
    IF e.type IN ('bounced', 'complained') THEN
      INSERT INTO email_suppressions (contact_id, email, reason, detail, provider, provider_event_id)
      SELECT v_cid, lower(trim(v_email)),
        (CASE
          WHEN e.type = 'complained' THEN 'spam_complaint'
          WHEN (e.payload ->> 'event') = 'invalid_email' THEN 'invalid_address'
          ELSE 'hard_bounce'
        END)::email_suppression_reason,
        'Reconciled from orphaned ' || e.type || ' event', coalesce(e.provider, 'brevo'), NULL
      WHERE NOT EXISTS (
        SELECT 1 FROM email_suppressions s WHERE s.email = lower(trim(v_email)) AND s.lifted_at IS NULL
      );
    ELSIF e.type = 'unsubscribed' THEN
      INSERT INTO email_suppressions (contact_id, email, reason, detail, provider, provider_event_id)
      SELECT v_cid, lower(trim(v_email)), 'unsubscribe'::email_suppression_reason,
        'Reconciled from orphaned unsubscribe event', coalesce(e.provider, 'brevo'), NULL
      WHERE NOT EXISTS (
        SELECT 1 FROM email_suppressions s WHERE s.email = lower(trim(v_email)) AND s.lifted_at IS NULL
      );
    END IF;

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
