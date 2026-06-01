CREATE OR REPLACE FUNCTION shop_finalize_paid_order_from_checkout(
  p_event_id text,
  p_session jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session_id text := p_session->>'id';
  v_order shop_orders%ROWTYPE;
  v_active_reservation_count integer;
  v_payment_intent_id text := p_session->>'payment_intent';
  v_customer_id text := p_session->>'customer';
  v_subtotal_cents integer := COALESCE(NULLIF(p_session->>'amount_subtotal', '')::integer, 0);
  v_shipping_cents integer := COALESCE(NULLIF(p_session #>> '{total_details,amount_shipping}', '')::integer, 0);
  v_tax_cents integer := COALESCE(NULLIF(p_session #>> '{total_details,amount_tax}', '')::integer, 0);
  v_total_cents integer := COALESCE(NULLIF(p_session->>'amount_total', '')::integer, 0);
BEGIN
  IF v_session_id IS NULL OR p_event_id IS NULL OR p_event_id = '' THEN
    RAISE EXCEPTION 'invalid_stripe_event' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO shop_stripe_events (event_id, event_type, stripe_checkout_session_id, payload)
  VALUES (p_event_id, 'checkout.session.completed', v_session_id, p_session)
  ON CONFLICT (event_id) DO NOTHING;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('duplicate', true);
  END IF;

  SELECT *
  INTO v_order
  FROM shop_orders
  WHERE stripe_checkout_session_id = v_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'shop_order_not_found_for_checkout_session' USING ERRCODE = 'P0001';
  END IF;

  UPDATE shop_stripe_events
  SET order_id = v_order.id
  WHERE event_id = p_event_id;

  IF v_order.status = 'paid' THEN
    RETURN jsonb_build_object('orderId', v_order.id, 'alreadyPaid', true);
  END IF;

  IF p_session->>'payment_status' IS DISTINCT FROM 'paid' THEN
    RAISE EXCEPTION 'checkout_session_not_paid' USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*)::integer
  INTO v_active_reservation_count
  FROM shop_inventory_reservations
  WHERE order_id = v_order.id
    AND status = 'active';

  UPDATE shop_product_variants variant
  SET stock_quantity = GREATEST(variant.stock_quantity - reservation.quantity, 0)
  FROM shop_inventory_reservations reservation
  WHERE reservation.order_id = v_order.id
    AND reservation.status = 'active'
    AND reservation.variant_id = variant.id;

  INSERT INTO shop_inventory_adjustments (variant_id, order_id, delta, reason, note)
  SELECT
    variant_id,
    order_id,
    -quantity,
    'order_paid',
    'Converted checkout reservation to sold stock.'
  FROM shop_inventory_reservations
  WHERE order_id = v_order.id
    AND status = 'active';

  UPDATE shop_inventory_reservations
  SET status = 'converted',
      updated_at = now()
  WHERE order_id = v_order.id
    AND status = 'active';

  UPDATE shop_orders
  SET status = 'paid',
      subtotal_cents = v_subtotal_cents,
      shipping_cents = v_shipping_cents,
      tax_cents = v_tax_cents,
      total_cents = v_total_cents,
      stripe_payment_intent_id = v_payment_intent_id,
      stripe_customer_id = v_customer_id,
      customer_email = COALESCE(p_session #>> '{customer_details,email}', p_session->>'customer_email'),
      customer_name = p_session #>> '{customer_details,name}',
      billing_address = COALESCE(p_session #> '{customer_details,address}', '{}'::jsonb),
      shipping_address = COALESCE(p_session #> '{shipping_details,address}', '{}'::jsonb)
  WHERE id = v_order.id
  RETURNING * INTO v_order;

  INSERT INTO shop_order_events (order_id, type, message, payload, customer_visible)
  VALUES (
    v_order.id,
    'payment_confirmed',
    CASE
      WHEN v_active_reservation_count = 0 THEN 'Payment confirmed without inventory reservations.'
      ELSE 'Payment confirmed.'
    END,
    jsonb_build_object(
      'stripeCheckoutSessionId', v_session_id,
      'stripePaymentIntentId', v_payment_intent_id,
      'activeReservations', v_active_reservation_count
    ),
    true
  );

  INSERT INTO shop_order_notifications (order_id, kind)
  VALUES
    (v_order.id, 'customer_confirmation'),
    (v_order.id, 'internal_alert')
  ON CONFLICT (order_id, kind) DO NOTHING;

  RETURN jsonb_build_object(
    'orderId', v_order.id,
    'paid', true,
    'activeReservations', v_active_reservation_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION shop_release_inventory_reservations(p_order_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
  v_order shop_orders%ROWTYPE;
BEGIN
  SELECT *
  INTO v_order
  FROM shop_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND OR v_order.stripe_checkout_session_id IS NOT NULL THEN
    RETURN 0;
  END IF;

  UPDATE shop_inventory_reservations
  SET status = 'released',
      updated_at = now()
  WHERE order_id = p_order_id
    AND status = 'active';

  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE shop_orders
  SET status = 'canceled'
  WHERE id = p_order_id
    AND status = 'pending';

  INSERT INTO shop_order_events (order_id, type, message, customer_visible)
  SELECT p_order_id, 'reservation_released', 'Reservations released.', false
  WHERE v_count > 0;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION shop_begin_checkout(
  p_profile_id uuid,
  p_checkout_attempt_id text,
  p_lines jsonb,
  p_customer_notes text,
  p_reservation_expires_at timestamptz
)
RETURNS TABLE (
  order_id uuid,
  order_number text,
  checkout_attempt_id text,
  reservation_expires_at timestamptz,
  stripe_checkout_session_id text,
  stripe_checkout_url text,
  subtotal_cents integer,
  requires_shipping boolean,
  line_items jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_profile_role text;
  v_cart_fingerprint text;
  v_existing shop_orders%ROWTYPE;
  v_existing_has_reservation boolean;
  v_existing_requires_reservation boolean;
  v_order shop_orders%ROWTYPE;
  v_subtotal_cents integer;
  v_requires_shipping boolean;
  v_line_items jsonb;
BEGIN
  IF p_profile_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'checkout_profile_mismatch' USING ERRCODE = 'P0001';
  END IF;

  SELECT role INTO v_profile_role
  FROM profiles
  WHERE id = p_profile_id;

  IF v_profile_role NOT IN ('member', 'admin') THEN
    RAISE EXCEPTION 'membership_required' USING ERRCODE = 'P0001';
  END IF;

  IF p_checkout_attempt_id IS NULL
    OR char_length(trim(p_checkout_attempt_id)) < 8
    OR char_length(trim(p_checkout_attempt_id)) > 80 THEN
    RAISE EXCEPTION 'invalid_checkout_attempt_id' USING ERRCODE = 'P0001';
  END IF;

  IF p_reservation_expires_at <= now() THEN
    RAISE EXCEPTION 'invalid_reservation_expiry' USING ERRCODE = 'P0001';
  END IF;

  PERFORM shop_expire_inventory_reservations();

  DROP TABLE IF EXISTS shop_checkout_lines;
  CREATE TEMP TABLE shop_checkout_lines (
    variant_id uuid PRIMARY KEY,
    quantity integer NOT NULL CHECK (quantity > 0)
  ) ON COMMIT DROP;

  INSERT INTO shop_checkout_lines (variant_id, quantity)
  SELECT
    (line->>'variantId')::uuid AS variant_id,
    sum((line->>'quantity')::integer)::integer AS quantity
  FROM jsonb_array_elements(p_lines) AS line
  GROUP BY (line->>'variantId')::uuid;

  IF NOT EXISTS (SELECT 1 FROM shop_checkout_lines) THEN
    RAISE EXCEPTION 'empty_cart' USING ERRCODE = 'P0001';
  END IF;

  SELECT encode(
    digest(
      COALESCE(
        jsonb_agg(
          jsonb_build_object('variantId', variant_id, 'quantity', quantity)
          ORDER BY variant_id
        )::text,
        '[]'
      ),
      'sha256'
    ),
    'hex'
  )
  INTO v_cart_fingerprint
  FROM shop_checkout_lines;

  SELECT *
  INTO v_existing
  FROM shop_orders
  WHERE profile_id = p_profile_id
    AND checkout_attempt_id = trim(p_checkout_attempt_id)
  FOR UPDATE;

  IF FOUND THEN
    SELECT EXISTS (
      SELECT 1
      FROM shop_inventory_reservations
      WHERE order_id = v_existing.id
        AND status = 'active'
        AND (
          expires_at > now()
          OR v_existing.stripe_checkout_session_id IS NOT NULL
        )
    )
    INTO v_existing_has_reservation;

    SELECT EXISTS (
      SELECT 1
      FROM shop_order_items item
      JOIN shop_product_variants variant ON variant.id = item.variant_id
      WHERE item.order_id = v_existing.id
        AND variant.track_inventory = true
    )
    INTO v_existing_requires_reservation;

    IF v_existing.status = 'pending'
      AND v_existing.cart_fingerprint = v_cart_fingerprint
      AND (
        v_existing.stripe_checkout_session_id IS NOT NULL
        OR (v_existing_requires_reservation = true AND v_existing_has_reservation = true)
        OR (v_existing_requires_reservation = false AND v_existing.reservation_expires_at > now())
      ) THEN
      SELECT COALESCE(jsonb_agg(to_jsonb(item) ORDER BY item.sort_order), '[]'::jsonb)
      INTO v_line_items
      FROM shop_order_items item
      WHERE item.order_id = v_existing.id;

      RETURN QUERY SELECT
        v_existing.id,
        v_existing.order_number,
        v_existing.checkout_attempt_id,
        v_existing.reservation_expires_at,
        v_existing.stripe_checkout_session_id,
        v_existing.stripe_checkout_url,
        v_existing.subtotal_cents,
        EXISTS (SELECT 1 FROM shop_order_items item WHERE item.order_id = v_existing.id AND item.product_type = 'physical'),
        COALESCE(v_line_items, '[]'::jsonb);
      RETURN;
    END IF;

    RAISE EXCEPTION 'checkout_attempt_conflict' USING ERRCODE = 'P0001';
  END IF;

  DROP TABLE IF EXISTS shop_checkout_details;
  CREATE TEMP TABLE shop_checkout_details (
    variant_id uuid PRIMARY KEY,
    product_id uuid NOT NULL,
    product_title text NOT NULL,
    variant_title text NOT NULL,
    sku text,
    product_type shop_product_type NOT NULL,
    product_status shop_product_status NOT NULL,
    product_visibility shop_product_visibility NOT NULL,
    purchase_access shop_purchase_access NOT NULL,
    requires_shipping boolean NOT NULL,
    variant_active boolean NOT NULL,
    track_inventory boolean NOT NULL,
    stock_quantity integer NOT NULL,
    active_reserved_quantity integer NOT NULL,
    price_cents integer NOT NULL,
    quantity integer NOT NULL,
    sort_order integer NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO shop_checkout_details (
    variant_id,
    product_id,
    product_title,
    variant_title,
    sku,
    product_type,
    product_status,
    product_visibility,
    purchase_access,
    requires_shipping,
    variant_active,
    track_inventory,
    stock_quantity,
    active_reserved_quantity,
    price_cents,
    quantity,
    sort_order
  )
  SELECT
    variant.id,
    product.id,
    product.title,
    variant.title,
    variant.sku,
    product.type,
    product.status,
    product.visibility,
    product.purchase_access,
    product.requires_shipping,
    variant.active,
    variant.track_inventory,
    variant.stock_quantity,
    COALESCE(reserved.quantity, 0),
    variant.price_cents,
    line.quantity,
    row_number() OVER (ORDER BY variant.id)::integer
  FROM shop_checkout_lines line
  JOIN shop_product_variants variant ON variant.id = line.variant_id
  JOIN shop_products product ON product.id = variant.product_id
  LEFT JOIN LATERAL (
    SELECT sum(reservation.quantity)::integer AS quantity
    FROM shop_inventory_reservations reservation
    WHERE reservation.variant_id = variant.id
      AND reservation.status = 'active'
  ) reserved ON true
  ORDER BY variant.id
  FOR UPDATE OF variant;

  IF (SELECT count(*) FROM shop_checkout_details) <> (SELECT count(*) FROM shop_checkout_lines) THEN
    RAISE EXCEPTION 'cart_variant_unavailable' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (SELECT 1 FROM shop_checkout_details WHERE variant_active = false) THEN
    RAISE EXCEPTION 'cart_variant_inactive' USING ERRCODE = 'P0001';
  END IF;

  IF v_profile_role <> 'admin'
    AND EXISTS (
      SELECT 1
      FROM shop_checkout_details
      WHERE product_status <> 'active'
        OR product_visibility NOT IN ('public', 'members')
    ) THEN
    RAISE EXCEPTION 'cart_product_unavailable' USING ERRCODE = 'P0001';
  END IF;

  IF v_profile_role = 'admin'
    AND EXISTS (SELECT 1 FROM shop_checkout_details WHERE product_status = 'archived') THEN
    RAISE EXCEPTION 'cart_product_archived' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM shop_checkout_details
    WHERE track_inventory = true
      AND stock_quantity - active_reserved_quantity < quantity
  ) THEN
    RAISE EXCEPTION 'insufficient_stock' USING ERRCODE = 'P0001';
  END IF;

  SELECT
    sum(quantity * price_cents)::integer,
    bool_or(requires_shipping)
  INTO v_subtotal_cents, v_requires_shipping
  FROM shop_checkout_details;

  INSERT INTO shop_orders (
    profile_id,
    checkout_attempt_id,
    cart_fingerprint,
    reservation_expires_at,
    subtotal_cents,
    total_cents,
    customer_notes
  )
  VALUES (
    p_profile_id,
    trim(p_checkout_attempt_id),
    v_cart_fingerprint,
    p_reservation_expires_at,
    v_subtotal_cents,
    v_subtotal_cents,
    COALESCE(trim(p_customer_notes), '')
  )
  RETURNING * INTO v_order;

  INSERT INTO shop_order_items (
    order_id,
    product_id,
    variant_id,
    product_title,
    variant_title,
    sku,
    product_type,
    fulfillment_type,
    quantity,
    unit_price_cents,
    line_subtotal_cents,
    sort_order
  )
  SELECT
    v_order.id,
    product_id,
    variant_id,
    product_title,
    variant_title,
    sku,
    product_type,
    CASE product_type
      WHEN 'physical' THEN 'physical'::shop_order_item_fulfillment_type
      WHEN 'digital' THEN 'manual_digital'::shop_order_item_fulfillment_type
      ELSE 'manual_service'::shop_order_item_fulfillment_type
    END,
    quantity,
    price_cents,
    quantity * price_cents,
    sort_order
  FROM shop_checkout_details;

  INSERT INTO shop_inventory_reservations (
    profile_id,
    order_id,
    variant_id,
    quantity,
    expires_at
  )
  SELECT
    p_profile_id,
    v_order.id,
    variant_id,
    quantity,
    p_reservation_expires_at
  FROM shop_checkout_details
  WHERE track_inventory = true;

  INSERT INTO shop_order_events (order_id, type, actor_id, message, customer_visible)
  VALUES
    (v_order.id, 'created', p_profile_id, 'Order created.', false),
    (v_order.id, 'checkout_started', p_profile_id, 'Checkout started.', true);

  SELECT COALESCE(jsonb_agg(to_jsonb(item) ORDER BY item.sort_order), '[]'::jsonb)
  INTO v_line_items
  FROM shop_order_items item
  WHERE item.order_id = v_order.id;

  RETURN QUERY SELECT
    v_order.id,
    v_order.order_number,
    v_order.checkout_attempt_id,
    v_order.reservation_expires_at,
    v_order.stripe_checkout_session_id,
    v_order.stripe_checkout_url,
    v_order.subtotal_cents,
    v_requires_shipping,
    COALESCE(v_line_items, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION shop_begin_checkout(uuid, text, jsonb, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION shop_release_inventory_reservations(uuid) TO service_role;
