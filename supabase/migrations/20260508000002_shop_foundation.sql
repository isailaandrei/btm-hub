CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE shop_product_type AS ENUM ('physical', 'digital', 'service');
CREATE TYPE shop_product_status AS ENUM ('draft', 'active', 'archived');
CREATE TYPE shop_product_visibility AS ENUM ('public', 'members', 'hidden');
CREATE TYPE shop_purchase_access AS ENUM ('public', 'members');
CREATE TYPE shop_order_status AS ENUM ('pending', 'paid', 'canceled', 'refunded', 'partially_refunded');
CREATE TYPE shop_fulfillment_status AS ENUM ('unfulfilled', 'in_progress', 'fulfilled', 'partially_fulfilled', 'canceled');
CREATE TYPE shop_order_item_fulfillment_type AS ENUM ('physical', 'manual_digital', 'manual_service');
CREATE TYPE shop_reservation_status AS ENUM ('active', 'converted', 'released', 'expired');
CREATE TYPE shop_order_event_type AS ENUM (
  'created',
  'checkout_started',
  'payment_confirmed',
  'payment_failed',
  'checkout_expired',
  'reservation_released',
  'fulfillment_updated',
  'tracking_updated',
  'email_sent',
  'email_failed',
  'refund_updated',
  'note'
);

CREATE TABLE shop_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(trim(title)) > 0 AND char_length(title) <= 160),
  slug text NOT NULL UNIQUE CHECK (slug = lower(trim(slug)) AND slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  type shop_product_type NOT NULL,
  status shop_product_status NOT NULL DEFAULT 'draft',
  visibility shop_product_visibility NOT NULL DEFAULT 'members',
  purchase_access shop_purchase_access NOT NULL DEFAULT 'members',
  short_description text NOT NULL DEFAULT '' CHECK (char_length(short_description) <= 500),
  content_blocks jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(content_blocks) = 'array'),
  stripe_tax_code text,
  tax_behavior text NOT NULL DEFAULT 'exclusive' CHECK (tax_behavior IN ('exclusive', 'inclusive')),
  requires_shipping boolean NOT NULL DEFAULT false,
  requires_customer_notes boolean NOT NULL DEFAULT false,
  customer_notes_label text NOT NULL DEFAULT 'Anything we should know?' CHECK (char_length(customer_notes_label) <= 120),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (type = 'physical' AND requires_shipping = true)
    OR (type <> 'physical' AND requires_shipping = false)
  )
);

CREATE TABLE shop_product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES shop_products(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(trim(title)) > 0 AND char_length(title) <= 120),
  sku text CHECK (sku IS NULL OR char_length(trim(sku)) BETWEEN 1 AND 80),
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  currency text NOT NULL DEFAULT 'eur' CHECK (currency = 'eur'),
  stripe_tax_code text,
  tax_behavior text NOT NULL DEFAULT 'exclusive' CHECK (tax_behavior IN ('exclusive', 'inclusive')),
  track_inventory boolean NOT NULL DEFAULT true,
  stock_quantity integer NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  low_stock_threshold integer NOT NULL DEFAULT 0 CHECK (low_stock_threshold >= 0),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, title)
);

CREATE TABLE shop_product_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES shop_products(id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE CHECK (char_length(trim(storage_path)) > 0),
  public_url text NOT NULL CHECK (char_length(trim(public_url)) > 0),
  alt_text text NOT NULL DEFAULT '' CHECK (char_length(alt_text) <= 240),
  caption text NOT NULL DEFAULT '' CHECK (char_length(caption) <= 300),
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  width integer CHECK (width IS NULL OR width > 0),
  height integer CHECK (height IS NULL OR height > 0),
  is_primary boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_shop_product_media_one_primary
  ON shop_product_media (product_id)
  WHERE is_primary = true;

CREATE TABLE shop_shipping_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(trim(name)) > 0 AND char_length(name) <= 120),
  slug text NOT NULL UNIQUE CHECK (slug = lower(trim(slug)) AND slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  allowed_countries text[] NOT NULL DEFAULT ARRAY[]::text[],
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (array_length(allowed_countries, 1) IS NULL OR allowed_countries <@ ARRAY[
    'AD','AE','AL','AM','AR','AT','AU','BA','BE','BG','BR','CA','CH','CL','CN','CY','CZ','DE','DK','EE','ES','FI','FR','GB','GR','HK','HR','HU','IE','IS','IT','JP','KR','LI','LT','LU','LV','MA','MC','MT','MX','NL','NO','NZ','PL','PT','RO','RS','SE','SG','SI','SK','TR','UA','US','ZA'
  ]::text[])
);

CREATE TABLE shop_shipping_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id uuid NOT NULL REFERENCES shop_shipping_zones(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(trim(name)) > 0 AND char_length(name) <= 120),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 300),
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  currency text NOT NULL DEFAULT 'eur' CHECK (currency = 'eur'),
  stripe_tax_code text,
  tax_behavior text NOT NULL DEFAULT 'exclusive' CHECK (tax_behavior IN ('exclusive', 'inclusive')),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (zone_id, name)
);

CREATE TABLE shop_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE DEFAULT ('BTM-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  checkout_attempt_id text NOT NULL CHECK (char_length(checkout_attempt_id) <= 80),
  cart_fingerprint text NOT NULL CHECK (char_length(cart_fingerprint) = 64),
  reservation_expires_at timestamptz NOT NULL,
  status shop_order_status NOT NULL DEFAULT 'pending',
  fulfillment_status shop_fulfillment_status NOT NULL DEFAULT 'unfulfilled',
  currency text NOT NULL DEFAULT 'eur' CHECK (currency = 'eur'),
  subtotal_cents integer NOT NULL DEFAULT 0 CHECK (subtotal_cents >= 0),
  shipping_cents integer NOT NULL DEFAULT 0 CHECK (shipping_cents >= 0),
  tax_cents integer NOT NULL DEFAULT 0 CHECK (tax_cents >= 0),
  total_cents integer NOT NULL DEFAULT 0 CHECK (total_cents >= 0),
  stripe_checkout_session_id text UNIQUE,
  stripe_checkout_url text,
  stripe_payment_intent_id text UNIQUE,
  stripe_customer_id text,
  customer_email text,
  customer_name text,
  billing_address jsonb NOT NULL DEFAULT '{}'::jsonb,
  shipping_address jsonb NOT NULL DEFAULT '{}'::jsonb,
  shipping_zone_id uuid REFERENCES shop_shipping_zones(id) ON DELETE SET NULL,
  customer_notes text NOT NULL DEFAULT '' CHECK (char_length(customer_notes) <= 2000),
  tracking_carrier text CHECK (tracking_carrier IS NULL OR char_length(tracking_carrier) <= 120),
  tracking_number text CHECK (tracking_number IS NULL OR char_length(tracking_number) <= 120),
  tracking_url text CHECK (tracking_url IS NULL OR char_length(tracking_url) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, checkout_attempt_id)
);

CREATE TABLE shop_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES shop_orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES shop_products(id) ON DELETE SET NULL,
  variant_id uuid REFERENCES shop_product_variants(id) ON DELETE SET NULL,
  product_title text NOT NULL,
  variant_title text NOT NULL,
  sku text,
  product_type shop_product_type NOT NULL,
  fulfillment_type shop_order_item_fulfillment_type NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price_cents integer NOT NULL CHECK (unit_price_cents >= 0),
  line_subtotal_cents integer NOT NULL CHECK (line_subtotal_cents >= 0),
  tax_cents integer NOT NULL DEFAULT 0 CHECK (tax_cents >= 0),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE shop_inventory_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES shop_orders(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES shop_product_variants(id) ON DELETE CASCADE,
  quantity integer NOT NULL CHECK (quantity > 0),
  expires_at timestamptz NOT NULL,
  status shop_reservation_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE shop_inventory_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id uuid NOT NULL REFERENCES shop_product_variants(id) ON DELETE CASCADE,
  order_id uuid REFERENCES shop_orders(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  delta integer NOT NULL,
  reason text NOT NULL CHECK (char_length(trim(reason)) > 0 AND char_length(reason) <= 120),
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 500),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE shop_order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES shop_orders(id) ON DELETE CASCADE,
  type shop_order_event_type NOT NULL,
  actor_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  message text NOT NULL DEFAULT '' CHECK (char_length(message) <= 1000),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  customer_visible boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE shop_stripe_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  stripe_checkout_session_id text,
  order_id uuid REFERENCES shop_orders(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE shop_order_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES shop_orders(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('customer_confirmation', 'internal_alert')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, kind)
);

CREATE INDEX idx_shop_products_listing
  ON shop_products (status, visibility, sort_order, created_at DESC);
CREATE INDEX idx_shop_product_variants_product_order
  ON shop_product_variants (product_id, sort_order, created_at);
CREATE INDEX idx_shop_media_product_order
  ON shop_product_media (product_id, sort_order, created_at);
CREATE INDEX idx_shop_reservations_active_variant
  ON shop_inventory_reservations (variant_id, expires_at)
  WHERE status = 'active';
CREATE INDEX idx_shop_orders_profile_created
  ON shop_orders (profile_id, created_at DESC);
CREATE INDEX idx_shop_orders_status_created
  ON shop_orders (status, created_at DESC);
CREATE INDEX idx_shop_order_items_order
  ON shop_order_items (order_id, sort_order);
CREATE INDEX idx_shop_stripe_events_session
  ON shop_stripe_events (stripe_checkout_session_id);
CREATE INDEX idx_shop_order_notifications_status
  ON shop_order_notifications (status, created_at);

CREATE OR REPLACE FUNCTION shop_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER shop_products_set_updated_at
  BEFORE UPDATE ON shop_products
  FOR EACH ROW EXECUTE FUNCTION shop_set_updated_at();
CREATE TRIGGER shop_product_variants_set_updated_at
  BEFORE UPDATE ON shop_product_variants
  FOR EACH ROW EXECUTE FUNCTION shop_set_updated_at();
CREATE TRIGGER shop_product_media_set_updated_at
  BEFORE UPDATE ON shop_product_media
  FOR EACH ROW EXECUTE FUNCTION shop_set_updated_at();
CREATE TRIGGER shop_shipping_zones_set_updated_at
  BEFORE UPDATE ON shop_shipping_zones
  FOR EACH ROW EXECUTE FUNCTION shop_set_updated_at();
CREATE TRIGGER shop_shipping_rates_set_updated_at
  BEFORE UPDATE ON shop_shipping_rates
  FOR EACH ROW EXECUTE FUNCTION shop_set_updated_at();
CREATE TRIGGER shop_orders_set_updated_at
  BEFORE UPDATE ON shop_orders
  FOR EACH ROW EXECUTE FUNCTION shop_set_updated_at();
CREATE TRIGGER shop_inventory_reservations_set_updated_at
  BEFORE UPDATE ON shop_inventory_reservations
  FOR EACH ROW EXECUTE FUNCTION shop_set_updated_at();
CREATE TRIGGER shop_order_notifications_set_updated_at
  BEFORE UPDATE ON shop_order_notifications
  FOR EACH ROW EXECUTE FUNCTION shop_set_updated_at();

INSERT INTO storage.buckets (id, name, public, allowed_mime_types, file_size_limit)
VALUES (
  'shop-product-media',
  'shop-product-media',
  true,
  ARRAY['image/jpeg', 'image/png', 'image/webp'],
  10485760
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  allowed_mime_types = EXCLUDED.allowed_mime_types,
  file_size_limit = EXCLUDED.file_size_limit;

ALTER TABLE shop_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_product_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_inventory_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_inventory_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_order_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_shipping_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_shipping_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_stripe_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_order_notifications ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE shop_stripe_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE shop_order_notifications FROM PUBLIC, anon, authenticated;

CREATE POLICY "Anyone can read public active products"
  ON shop_products FOR SELECT
  USING (status = 'active' AND visibility = 'public');

CREATE POLICY "Members can read active member products"
  ON shop_products FOR SELECT TO authenticated
  USING (
    status = 'active'
    AND visibility IN ('public', 'members')
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('member', 'admin')
    )
  );

CREATE POLICY "Admins can manage products"
  ON shop_products FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY "Anyone can read variants for public active products"
  ON shop_product_variants FOR SELECT
  USING (
    active = true
    AND EXISTS (
      SELECT 1 FROM shop_products
      WHERE shop_products.id = shop_product_variants.product_id
        AND shop_products.status = 'active'
        AND shop_products.visibility = 'public'
    )
  );

CREATE POLICY "Members can read variants for eligible active products"
  ON shop_product_variants FOR SELECT TO authenticated
  USING (
    active = true
    AND EXISTS (
      SELECT 1 FROM shop_products
      JOIN profiles ON profiles.id = auth.uid()
      WHERE shop_products.id = shop_product_variants.product_id
        AND shop_products.status = 'active'
        AND shop_products.visibility IN ('public', 'members')
        AND profiles.role IN ('member', 'admin')
    )
  );

CREATE POLICY "Admins can manage variants"
  ON shop_product_variants FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY "Anyone can read media for public active products"
  ON shop_product_media FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM shop_products
      WHERE shop_products.id = shop_product_media.product_id
        AND shop_products.status = 'active'
        AND shop_products.visibility = 'public'
    )
  );

CREATE POLICY "Members can read media for eligible active products"
  ON shop_product_media FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM shop_products
      JOIN profiles ON profiles.id = auth.uid()
      WHERE shop_products.id = shop_product_media.product_id
        AND shop_products.status = 'active'
        AND shop_products.visibility IN ('public', 'members')
        AND profiles.role IN ('member', 'admin')
    )
  );

CREATE POLICY "Admins can manage media"
  ON shop_product_media FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY "Admins can manage inventory adjustments"
  ON shop_inventory_adjustments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY "Admins can manage inventory reservations"
  ON shop_inventory_reservations FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY "Members can read their own orders"
  ON shop_orders FOR SELECT TO authenticated
  USING (profile_id = auth.uid());

CREATE POLICY "Admins can manage orders"
  ON shop_orders FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY "Members can read their own order items"
  ON shop_order_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM shop_orders
      WHERE shop_orders.id = shop_order_items.order_id
        AND shop_orders.profile_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage order items"
  ON shop_order_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY "Members can read their own customer-visible order events"
  ON shop_order_events FOR SELECT TO authenticated
  USING (
    customer_visible = true
    AND EXISTS (
      SELECT 1 FROM shop_orders
      WHERE shop_orders.id = shop_order_events.order_id
        AND shop_orders.profile_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage order events"
  ON shop_order_events FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY "Anyone can read active shipping zones"
  ON shop_shipping_zones FOR SELECT
  USING (active = true);

CREATE POLICY "Admins can manage shipping zones"
  ON shop_shipping_zones FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY "Anyone can read active shipping rates"
  ON shop_shipping_rates FOR SELECT
  USING (
    active = true
    AND EXISTS (
      SELECT 1 FROM shop_shipping_zones
      WHERE shop_shipping_zones.id = shop_shipping_rates.zone_id
        AND shop_shipping_zones.active = true
    )
  );

CREATE POLICY "Admins can manage shipping rates"
  ON shop_shipping_rates FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY "Anyone can read shop product media objects"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'shop-product-media');

CREATE POLICY "Admins can upload shop product media"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'shop-product-media'
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

CREATE POLICY "Admins can update shop product media"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'shop-product-media'
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  )
  WITH CHECK (
    bucket_id = 'shop-product-media'
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

CREATE POLICY "Admins can delete shop product media"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'shop-product-media'
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

CREATE OR REPLACE FUNCTION shop_expire_inventory_reservations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE shop_inventory_reservations
  SET status = 'expired',
      updated_at = now()
  WHERE status = 'active'
    AND expires_at <= now()
    AND NOT EXISTS (
      SELECT 1 FROM shop_orders
      WHERE shop_orders.id = shop_inventory_reservations.order_id
        AND shop_orders.stripe_checkout_session_id IS NOT NULL
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
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

CREATE OR REPLACE FUNCTION shop_attach_checkout_session(
  p_order_id uuid,
  p_profile_id uuid,
  p_checkout_attempt_id text,
  p_stripe_checkout_session_id text,
  p_stripe_checkout_url text
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
  SET stripe_checkout_session_id = COALESCE(stripe_checkout_session_id, p_stripe_checkout_session_id),
      stripe_checkout_url = COALESCE(stripe_checkout_url, p_stripe_checkout_url)
  WHERE id = p_order_id;
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
    'Payment confirmed.',
    jsonb_build_object('stripeCheckoutSessionId', v_session_id, 'stripePaymentIntentId', v_payment_intent_id),
    true
  );

  INSERT INTO shop_order_notifications (order_id, kind)
  VALUES
    (v_order.id, 'customer_confirmation'),
    (v_order.id, 'internal_alert')
  ON CONFLICT (order_id, kind) DO NOTHING;

  RETURN jsonb_build_object('orderId', v_order.id, 'paid', true);
END;
$$;

CREATE OR REPLACE FUNCTION shop_release_order_for_checkout_session(
  p_event_id text,
  p_stripe_checkout_session_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order shop_orders%ROWTYPE;
  v_released_count integer;
BEGIN
  INSERT INTO shop_stripe_events (event_id, event_type, stripe_checkout_session_id, payload)
  VALUES (
    p_event_id,
    'checkout.session.expired',
    p_stripe_checkout_session_id,
    jsonb_build_object('stripeCheckoutSessionId', p_stripe_checkout_session_id)
  )
  ON CONFLICT (event_id) DO NOTHING;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('duplicate', true);
  END IF;

  SELECT *
  INTO v_order
  FROM shop_orders
  WHERE stripe_checkout_session_id = p_stripe_checkout_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'shop_order_not_found_for_checkout_session' USING ERRCODE = 'P0001';
  END IF;

  UPDATE shop_stripe_events
  SET order_id = v_order.id
  WHERE event_id = p_event_id;

  IF v_order.status <> 'pending' THEN
    RETURN jsonb_build_object('orderId', v_order.id, 'status', v_order.status);
  END IF;

  UPDATE shop_inventory_reservations
  SET status = 'released',
      updated_at = now()
  WHERE order_id = v_order.id
    AND status = 'active';

  GET DIAGNOSTICS v_released_count = ROW_COUNT;

  UPDATE shop_orders
  SET status = 'canceled'
  WHERE id = v_order.id;

  INSERT INTO shop_order_events (order_id, type, message, payload, customer_visible)
  VALUES (
    v_order.id,
    'checkout_expired',
    'Checkout expired before payment was completed.',
    jsonb_build_object('stripeCheckoutSessionId', p_stripe_checkout_session_id, 'releasedReservations', v_released_count),
    true
  );

  RETURN jsonb_build_object('orderId', v_order.id, 'releasedReservations', v_released_count);
END;
$$;

CREATE OR REPLACE FUNCTION shop_record_refund_event(
  p_event_id text,
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
  v_amount_refunded integer := COALESCE(NULLIF(p_payload->>'amount_refunded', '')::integer, NULLIF(p_payload->>'amount', '')::integer, 0);
  v_next_status shop_order_status;
BEGIN
  INSERT INTO shop_stripe_events (event_id, event_type, payload)
  VALUES (p_event_id, 'refund.updated', p_payload)
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

  v_next_status := CASE
    WHEN v_amount_refunded >= v_order.total_cents THEN 'refunded'::shop_order_status
    ELSE 'partially_refunded'::shop_order_status
  END;

  UPDATE shop_orders
  SET status = v_next_status
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
    p_payload,
    true
  );

  RETURN jsonb_build_object('orderId', v_order.id, 'status', v_order.status);
END;
$$;

REVOKE EXECUTE ON FUNCTION shop_expire_inventory_reservations() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION shop_begin_checkout(uuid, text, jsonb, text, timestamptz) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION shop_attach_checkout_session(uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION shop_finalize_paid_order_from_checkout(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION shop_release_inventory_reservations(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION shop_release_order_for_checkout_session(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION shop_record_refund_event(text, jsonb) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION shop_begin_checkout(uuid, text, jsonb, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION shop_attach_checkout_session(uuid, uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION shop_expire_inventory_reservations() TO service_role;
GRANT EXECUTE ON FUNCTION shop_finalize_paid_order_from_checkout(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION shop_release_inventory_reservations(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION shop_release_order_for_checkout_session(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION shop_record_refund_event(text, jsonb) TO service_role;
