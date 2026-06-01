ALTER TABLE shop_orders
  ADD COLUMN IF NOT EXISTS shipping_rate_id uuid REFERENCES shop_shipping_rates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS shipping_country text CHECK (
    shipping_country IS NULL
    OR (
      shipping_country = upper(trim(shipping_country))
      AND char_length(shipping_country) = 2
    )
  ),
  ADD COLUMN IF NOT EXISTS shipping_rate_name text CHECK (
    shipping_rate_name IS NULL
    OR char_length(shipping_rate_name) <= 120
  ),
  ADD COLUMN IF NOT EXISTS refunded_cents integer NOT NULL DEFAULT 0 CHECK (refunded_cents >= 0);

CREATE TABLE IF NOT EXISTS shop_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_refund_id text NOT NULL UNIQUE,
  order_id uuid REFERENCES shop_orders(id) ON DELETE CASCADE,
  stripe_payment_intent_id text,
  amount_cents integer NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
  status text NOT NULL DEFAULT 'unknown' CHECK (char_length(status) <= 80),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shop_refunds_order_created
  ON shop_refunds (order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shop_refunds_payment_intent
  ON shop_refunds (stripe_payment_intent_id);

ALTER TABLE shop_refunds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE shop_refunds FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS shop_refunds_set_updated_at ON shop_refunds;
CREATE TRIGGER shop_refunds_set_updated_at
  BEFORE UPDATE ON shop_refunds
  FOR EACH ROW EXECUTE FUNCTION shop_set_updated_at();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'shop_refunds'
      AND policyname = 'Members can read their own shop refunds'
  ) THEN
    CREATE POLICY "Members can read their own shop refunds"
      ON shop_refunds FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM shop_orders
          WHERE shop_orders.id = shop_refunds.order_id
            AND shop_orders.profile_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'shop_refunds'
      AND policyname = 'Admins can manage shop refunds'
  ) THEN
    CREATE POLICY "Admins can manage shop refunds"
      ON shop_refunds FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
      WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE shop_refunds TO authenticated;
GRANT ALL ON TABLE shop_refunds TO service_role;

DROP FUNCTION IF EXISTS shop_attach_checkout_session(uuid, uuid, text, text, text);

CREATE OR REPLACE FUNCTION shop_attach_checkout_session(
  p_order_id uuid,
  p_profile_id uuid,
  p_checkout_attempt_id text,
  p_stripe_checkout_session_id text,
  p_stripe_checkout_url text,
  p_shipping_zone_id uuid,
  p_shipping_rate_id uuid,
  p_shipping_country text,
  p_shipping_rate_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order shop_orders%ROWTYPE;
BEGIN
  SELECT *
  INTO v_order
  FROM shop_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_order.profile_id <> p_profile_id
    OR v_order.checkout_attempt_id <> p_checkout_attempt_id THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF v_order.status <> 'pending' THEN
    RAISE EXCEPTION 'order_not_pending' USING ERRCODE = 'P0001';
  END IF;

  IF v_order.stripe_checkout_session_id IS NOT NULL
    AND v_order.stripe_checkout_session_id <> p_stripe_checkout_session_id THEN
    RAISE EXCEPTION 'checkout_session_conflict' USING ERRCODE = 'P0001';
  END IF;

  UPDATE shop_orders
  SET stripe_checkout_session_id = COALESCE(shop_orders.stripe_checkout_session_id, p_stripe_checkout_session_id),
      stripe_checkout_url = COALESCE(shop_orders.stripe_checkout_url, p_stripe_checkout_url),
      shipping_zone_id = COALESCE(shop_orders.shipping_zone_id, p_shipping_zone_id),
      shipping_rate_id = COALESCE(shop_orders.shipping_rate_id, p_shipping_rate_id),
      shipping_country = COALESCE(shop_orders.shipping_country, NULLIF(upper(trim(p_shipping_country)), '')),
      shipping_rate_name = COALESCE(shop_orders.shipping_rate_name, NULLIF(trim(p_shipping_rate_name), ''))
  WHERE id = p_order_id;
END;
$$;

DROP FUNCTION IF EXISTS shop_record_refund_event(text, jsonb);

CREATE OR REPLACE FUNCTION shop_record_refund_event(
  p_event_id text,
  p_event_type text,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payment_intent_id text := COALESCE(p_payload->>'payment_intent', p_payload #>> '{payment_intent,id}');
  v_order shop_orders%ROWTYPE;
  v_refund jsonb;
  v_refund_count integer := 0;
  v_refunded_cents integer := 0;
  v_next_status shop_order_status;
BEGIN
  INSERT INTO shop_stripe_events (event_id, event_type, payload)
  VALUES (p_event_id, p_event_type, p_payload)
  ON CONFLICT (event_id) DO NOTHING;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('duplicate', true);
  END IF;

  IF v_payment_intent_id IS NULL THEN
    RETURN jsonb_build_object('recorded', true, 'orderMatched', false);
  END IF;

  SELECT *
  INTO v_order
  FROM shop_orders
  WHERE stripe_payment_intent_id = v_payment_intent_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('recorded', true, 'orderMatched', false);
  END IF;

  FOR v_refund IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(p_payload #> '{refunds,data}', '[]'::jsonb))
  LOOP
    IF v_refund->>'id' IS NOT NULL THEN
      INSERT INTO shop_refunds (
        stripe_refund_id,
        order_id,
        stripe_payment_intent_id,
        amount_cents,
        status,
        payload
      )
      VALUES (
        v_refund->>'id',
        v_order.id,
        v_payment_intent_id,
        COALESCE(NULLIF(v_refund->>'amount', '')::integer, 0),
        COALESCE(NULLIF(v_refund->>'status', ''), 'unknown'),
        v_refund
      )
      ON CONFLICT (stripe_refund_id) DO UPDATE
      SET order_id = EXCLUDED.order_id,
          stripe_payment_intent_id = EXCLUDED.stripe_payment_intent_id,
          amount_cents = EXCLUDED.amount_cents,
          status = EXCLUDED.status,
          payload = EXCLUDED.payload,
          updated_at = now();

      v_refund_count := v_refund_count + 1;
    END IF;
  END LOOP;

  IF v_refund_count = 0 AND p_payload->>'id' IS NOT NULL AND p_event_type LIKE 'refund.%' THEN
    INSERT INTO shop_refunds (
      stripe_refund_id,
      order_id,
      stripe_payment_intent_id,
      amount_cents,
      status,
      payload
    )
    VALUES (
      p_payload->>'id',
      v_order.id,
      v_payment_intent_id,
      COALESCE(NULLIF(p_payload->>'amount', '')::integer, 0),
      COALESCE(NULLIF(p_payload->>'status', ''), 'unknown'),
      p_payload
    )
    ON CONFLICT (stripe_refund_id) DO UPDATE
    SET order_id = EXCLUDED.order_id,
        stripe_payment_intent_id = EXCLUDED.stripe_payment_intent_id,
        amount_cents = EXCLUDED.amount_cents,
        status = EXCLUDED.status,
        payload = EXCLUDED.payload,
        updated_at = now();

    v_refund_count := 1;
  END IF;

  SELECT COALESCE(sum(amount_cents), 0)::integer
  INTO v_refunded_cents
  FROM shop_refunds
  WHERE order_id = v_order.id
    AND status = 'succeeded';

  IF v_refunded_cents = 0 AND p_payload->>'amount_refunded' IS NOT NULL THEN
    v_refunded_cents := COALESCE(NULLIF(p_payload->>'amount_refunded', '')::integer, 0);
  END IF;

  v_refunded_cents := GREATEST(v_refunded_cents, 0);

  v_next_status := CASE
    WHEN v_refunded_cents <= 0
      AND v_order.status IN ('refunded', 'partially_refunded') THEN 'paid'::shop_order_status
    WHEN v_refunded_cents <= 0 THEN v_order.status
    WHEN v_order.total_cents > 0 AND v_refunded_cents >= v_order.total_cents THEN 'refunded'::shop_order_status
    ELSE 'partially_refunded'::shop_order_status
  END;

  UPDATE shop_orders
  SET status = v_next_status,
      refunded_cents = v_refunded_cents
  WHERE id = v_order.id
  RETURNING * INTO v_order;

  UPDATE shop_stripe_events
  SET order_id = v_order.id
  WHERE event_id = p_event_id;

  INSERT INTO shop_order_events (order_id, type, message, payload, customer_visible)
  VALUES (
    v_order.id,
    'refund_updated',
    'Refund status updated from Stripe.',
    jsonb_build_object(
      'eventType', p_event_type,
      'refundedCents', v_refunded_cents,
      'payload', p_payload
    ),
    true
  );

  RETURN jsonb_build_object(
    'orderId', v_order.id,
    'status', v_order.status,
    'refundedCents', v_refunded_cents,
    'recordedRefunds', v_refund_count
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION shop_attach_checkout_session(uuid, uuid, text, text, text, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION shop_record_refund_event(text, text, jsonb) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION shop_attach_checkout_session(uuid, uuid, text, text, text, uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION shop_record_refund_event(text, text, jsonb) TO service_role;
