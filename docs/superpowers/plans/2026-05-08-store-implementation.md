# BTM Store Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a custom EUR-only, member-checkout store in BTM Hub with Supabase-managed products, Stripe Checkout + Stripe Tax, manual fulfillment, Brevo emails, and member/admin order views.

**Architecture:** Keep commerce inside the existing Next.js 16 App Router app as a modular monolith. Supabase Postgres owns product, inventory, reservation, order, and fulfillment state; Stripe owns hosted payment/tax calculation; Brevo sends transactional order emails. Server components fetch read data directly, server actions handle mutations, route handlers process Stripe webhooks, and small client components handle cart and product-detail interactions.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase Postgres/RLS/Storage, Stripe Checkout/Tax/Webhooks, Brevo email provider, Tailwind CSS 4, shadcn/ui, Vitest, Playwright.

---

## Source Documents And Current Worktree

- Design spec: `docs/superpowers/specs/2026-05-08-store-design.md`
- Worktree: `/Users/andrei/Dev/btm-hub/.worktrees/store-implementation-plan`
- Branch: `feature/store-implementation-plan`
- Do not implement in `/Users/andrei/Dev/btm-hub` on `main`.

Official docs checked before planning:

- Next.js 16 route handlers: https://nextjs.org/docs/app/getting-started/route-handlers
- Stripe Checkout: https://docs.stripe.com/payments/checkout
- Stripe Tax with Checkout: https://docs.stripe.com/tax/checkout
- Stripe webhook signatures: https://docs.stripe.com/webhooks/signature
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Storage uploads: https://supabase.com/docs/guides/storage/uploads/standard-uploads

## Architectural Review

**Decision: custom store module, not a commerce engine.**  
This matches the small catalog, manual operations, and low-vendor-cost constraint. A headless commerce engine would add a second operational system before the project has enough product volume to justify it.

**Decision: feature/domain organization.**  
Store-specific data access, domain helpers, Stripe integration, email helpers, and components should live under `src/lib/shop`, `src/components/shop`, and route-local folders. Shared primitives stay in `src/components/ui`.

**Decision: server-owned checkout.**  
The client cart stores only variant IDs and quantities. The server reloads product/variant data, validates member access, creates reservations, calculates shipping choices, and creates Stripe Checkout sessions. This avoids trusting stale or manipulated client totals.

**Decision: 30-minute Checkout-aligned reservations.**
The user preference was 10 minutes, but Stripe Checkout's hosted `expires_at` cannot be shorter than 30 minutes. Launch uses a 30-minute reservation TTL and sets the Stripe Checkout Session `expires_at` to the same timestamp so inventory state and Stripe state cannot disagree.

**Decision: custom cart instead of `use-shopping-cart`.**  
The cart requirement is small. The stable package has older React-era dependencies and the React 19-compatible line is still an RC. A local `useSyncExternalStore` cart is easier to audit and keeps checkout validation server-owned.

**Decision: JSONB content blocks, small schema.**  
This gives CMS-like product detail content from the admin dashboard without adding Sanity to commerce. The block schema stays narrow: rich text, media reference, specs table, bullets, care instructions, digital notes, service notes.

**Decision: card-only Checkout payment methods for launch.**
Stripe Checkout still surfaces supported wallets through the card payment method where available. Restricting launch Checkout to `payment_method_types: ["card"]` avoids asynchronous payment methods until the app has explicit `checkout.session.async_payment_succeeded` and `checkout.session.async_payment_failed` flows.

**Over-engineering intentionally deferred:** promotions, live carrier rates, automated label purchase, automated digital delivery, booking calendars, multi-currency presentment, public checkout, product reviews, and reporting dashboards beyond operational CSV export.

## File Map

### Database And Types

- Create `supabase/migrations/20260508000002_shop_foundation.sql`  
  Creates shop enums, tables, constraints, indexes, RLS policies, storage bucket, idempotency tables, notification tables, and atomic reservation/finalization helper functions.
- Modify `src/types/database.ts`  
  Adds shop interfaces and union types used by server components and tests.

### Domain And Data Layer

- Create `src/lib/shop/types.ts`  
  Shared domain types derived from `src/types/database.ts` plus cart/input shapes.
- Create `src/lib/shop/money.ts` and `src/lib/shop/money.test.ts`  
  EUR cent formatting and validation.
- Create `src/lib/shop/visibility.ts` and `src/lib/shop/visibility.test.ts`  
  Public/member/admin product visibility and purchase access decisions.
- Create `src/lib/shop/content-blocks.ts` and `src/lib/shop/content-blocks.test.ts`  
  Zod validation for product rich content JSONB.
- Create `src/lib/shop/cart-validation.ts` and `src/lib/shop/cart-validation.test.ts`  
  Server-side validation for cart lines against current product/variant rows.
- Create `src/lib/shop/reservations.ts` and `src/lib/shop/reservations.test.ts`  
  Reservation expiry constants and helpers.
- Create `src/lib/data/shop-products.ts` and `src/lib/data/shop-products.test.ts`  
  Product listing/detail/admin fetchers.
- Create `src/lib/data/shop-orders.ts` and `src/lib/data/shop-orders.test.ts`  
  Order/member/admin fetchers, customer-visible timeline fetchers, Stripe event idempotency helpers, notification claim helpers, and event writers.
- Create `src/lib/data/shop-admin.ts` and `src/lib/data/shop-admin.test.ts`  
  Admin product, variant, media, shipping, fulfillment mutations.

### Stripe And Email

- Create `src/lib/shop/stripe.ts` and `src/lib/shop/stripe.test.ts`  
  Stripe client/config, Checkout Session payload builder, webhook event construction boundary.
- Create `src/lib/shop/checkout.ts` and `src/lib/shop/checkout.test.ts`  
  Checkout orchestration: member validation, cart validation, reservation RPC, Stripe session creation.
- Create `src/app/api/shop/stripe/webhook/route.ts` and `src/app/api/shop/stripe/webhook/route.test.ts`  
  Stripe webhook route handler using raw body + `Stripe-Signature`.
- Create `src/lib/shop/order-emails.ts` and `src/lib/shop/order-emails.test.ts`  
  Customer confirmation and internal order alert email rendering/sending through existing email provider abstraction.

### Storefront And Cart

- Modify `src/components/layout/Navbar.tsx`  
  Adds Shop link.
- Replace `src/app/(marketing)/shop/page.tsx`  
  Product listing page.
- Create `src/app/(marketing)/shop/[slug]/page.tsx`  
  Product detail page.
- Create `src/app/(marketing)/shop/cart/page.tsx`  
  Cart review page.
- Create `src/app/(marketing)/shop/checkout/page.tsx`  
  Pre-checkout page for optional service notes and final validation.
- Create `src/app/(marketing)/shop/success/page.tsx`  
  Checkout success page.
- Create `src/app/(marketing)/shop/canceled/page.tsx`  
  Checkout canceled page.
- Create `src/app/(marketing)/shop/actions.ts` and `src/app/(marketing)/shop/actions.test.ts`  
  Server actions for checkout start and reservation release when needed.
- Create `src/components/shop/ProductGrid.tsx`
- Create `src/components/shop/ProductCard.tsx`
- Create `src/components/shop/ProductDetail.tsx`
- Create `src/components/shop/ProductGallery.tsx`
- Create `src/components/shop/ProductPurchasePanel.tsx`
- Create `src/components/shop/RichContentBlocks.tsx`
- Create `src/components/shop/cart-store.ts`
- Create `src/components/shop/cart-store.test.ts`
- Create `src/components/shop/CartButton.tsx`
- Create `src/components/shop/CartReview.tsx`

### Admin

- Modify `src/app/(dashboard)/admin/admin-dashboard.tsx`  
  Adds `Shop` tab lazy-loading a shop admin module.
- Create `src/app/(dashboard)/admin/shop/actions.ts` and `src/app/(dashboard)/admin/shop/actions.test.ts`
- Create `src/app/(dashboard)/admin/shop/shop-admin.tsx`
- Create `src/app/(dashboard)/admin/shop/products-panel.tsx`
- Create `src/app/(dashboard)/admin/shop/product-editor.tsx`
- Create `src/app/(dashboard)/admin/shop/product-media-uploader.tsx`
- Create `src/app/(dashboard)/admin/shop/rich-content-editor.tsx`
- Create `src/app/(dashboard)/admin/shop/shipping-rates-panel.tsx`
- Create `src/app/(dashboard)/admin/shop/orders-panel.tsx`
- Create `src/app/(dashboard)/admin/shop/order-detail.tsx`
- Create `src/app/(dashboard)/admin/shop/low-stock-panel.tsx`

### Member Orders

- Modify `src/app/(dashboard)/profile/profile-sidebar.tsx`  
  Adds Orders nav item.
- Create `src/app/(dashboard)/profile/orders/page.tsx`
- Create `src/app/(dashboard)/profile/orders/[id]/page.tsx`
- Create `src/components/shop/MemberOrderList.tsx`
- Create `src/components/shop/MemberOrderDetail.tsx`

### E2E And Docs

- Create `e2e/shop.spec.ts`
- Modify `docs/admin-email-operations.md` or a repo env reference if present
  Documents Stripe/shop env vars and operational webhook setup. Do not create a misleading `.env.example` if the repo does not already use one.
- Keep `docs/superpowers/specs/2026-05-08-store-design.md` unchanged unless scope changes.

## Environment Variables

Add or document these variables during implementation:

```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
SHOP_INTERNAL_ALERT_EMAIL=owner@behind-the-mask.com
EMAIL_PROVIDER=fake
```

Production must use `EMAIL_PROVIDER=brevo` with `BREVO_API_KEY` already configured by the existing email module.

---

## Phase 1: Database Foundation And Types

**Goal:** Create the shop schema with RLS, storage, atomic reservation primitives, and TypeScript interfaces.

**Gate:** `npm run test:unit -- src/lib/shop/money.test.ts src/lib/shop/visibility.test.ts src/lib/shop/content-blocks.test.ts` passes, and the migration can be reviewed without unresolved naming conflicts.

### Task 1.1: Add Shop Migration

**Files:**
- Create: `supabase/migrations/20260508000002_shop_foundation.sql`

- [ ] **Step 1: Write the migration file**

Create the migration with these structural requirements:

```sql
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
```

Then add the remaining tables from the design spec:

- `shop_product_variants`
- `shop_product_media`
- `shop_inventory_adjustments`
- `shop_inventory_reservations`
- `shop_orders`
- `shop_order_items`
- `shop_order_events`
- `shop_shipping_zones`
- `shop_shipping_rates`
- `shop_stripe_events`
- `shop_order_notifications`

Use these constraints:

```sql
-- Variant constraints
currency text NOT NULL DEFAULT 'eur' CHECK (currency = 'eur');
price_cents integer NOT NULL CHECK (price_cents >= 0);
stripe_tax_code text;
tax_behavior text NOT NULL DEFAULT 'exclusive' CHECK (tax_behavior IN ('exclusive', 'inclusive'));
stock_quantity integer NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0);
low_stock_threshold integer NOT NULL DEFAULT 0 CHECK (low_stock_threshold >= 0);

-- Reservation constraints
quantity integer NOT NULL CHECK (quantity > 0);
expires_at timestamptz NOT NULL;
status shop_reservation_status NOT NULL DEFAULT 'active';

-- Order constraints
order_number text NOT NULL UNIQUE;
checkout_attempt_id text NOT NULL CHECK (char_length(checkout_attempt_id) <= 80);
cart_fingerprint text NOT NULL CHECK (char_length(cart_fingerprint) = 64);
reservation_expires_at timestamptz NOT NULL;
currency text NOT NULL DEFAULT 'eur' CHECK (currency = 'eur');
subtotal_cents integer NOT NULL DEFAULT 0 CHECK (subtotal_cents >= 0);
shipping_cents integer NOT NULL DEFAULT 0 CHECK (shipping_cents >= 0);
tax_cents integer NOT NULL DEFAULT 0 CHECK (tax_cents >= 0);
total_cents integer NOT NULL DEFAULT 0 CHECK (total_cents >= 0);
stripe_checkout_session_id text UNIQUE;
stripe_checkout_url text;
stripe_payment_intent_id text UNIQUE;
billing_address jsonb NOT NULL DEFAULT '{}'::jsonb;
shipping_address jsonb NOT NULL DEFAULT '{}'::jsonb;
customer_notes text NOT NULL DEFAULT '' CHECK (char_length(customer_notes) <= 2000);

-- Event visibility
customer_visible boolean NOT NULL DEFAULT false;

-- Shipping zones and rates
allowed_countries text[] NOT NULL DEFAULT ARRAY[]::text[];
stripe_tax_code text;
tax_behavior text NOT NULL DEFAULT 'exclusive' CHECK (tax_behavior IN ('exclusive', 'inclusive'));

-- Stripe event idempotency
CREATE TABLE shop_stripe_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  stripe_checkout_session_id text,
  order_id uuid REFERENCES shop_orders(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed_at timestamptz NOT NULL DEFAULT now()
);

-- Email idempotency
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
```

Add indexes:

```sql
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
CREATE UNIQUE INDEX idx_shop_orders_checkout_attempt
  ON shop_orders (profile_id, checkout_attempt_id);
CREATE INDEX idx_shop_order_items_order
  ON shop_order_items (order_id, sort_order);
CREATE INDEX idx_shop_stripe_events_session
  ON shop_stripe_events (stripe_checkout_session_id);
CREATE INDEX idx_shop_order_notifications_status
  ON shop_order_notifications (status, created_at);
```

Add storage bucket:

```sql
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
```

- [ ] **Step 2: Add RLS policies**

Add policies matching these exact access rules:

```sql
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
```

Repeat the admin `FOR ALL` policy shape for every shop admin table. Add these additional policies explicitly:

```sql
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

CREATE POLICY "Anyone can read active shipping zones"
  ON shop_shipping_zones FOR SELECT
  USING (active = true);

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
```

Member order read policies for `shop_orders` and `shop_order_items` must join through `shop_orders.profile_id = auth.uid()`. Do not allow members to read `shop_inventory_reservations`, `shop_inventory_adjustments`, `shop_stripe_events`, `shop_order_notifications`, or non-customer-visible order events directly. `shop_stripe_events` and `shop_order_notifications` are service-role-only implementation tables; do not add anon/auth policies for them.

Add storage object policies for `shop-product-media`:

```sql
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
```

- [ ] **Step 3: Add atomic reservation RPCs**

Add SQL functions:

```sql
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
```

The cleanup function must never expire reservations for orders already attached to a Stripe Checkout Session. Stripe-attached reservations are released by `checkout.session.expired` or by a reconciliation job that first retrieves the Stripe Session and verifies `status = 'expired'`.

Add `shop_begin_checkout(p_profile_id uuid, p_checkout_attempt_id text, p_lines jsonb, p_customer_notes text, p_reservation_expires_at timestamptz)` as a `SECURITY DEFINER SET search_path = public, pg_temp` function that:

- calls `shop_expire_inventory_reservations()`
- verifies `p_profile_id = auth.uid()`
- verifies the profile role is `member` or `admin`
- normalizes `p_lines` in deterministic variant order and computes a `cart_fingerprint`
- computes `cart_fingerprint` with `encode(digest(normalized_lines::text, 'sha256'), 'hex')`
- checks for an existing `shop_orders` row with `(profile_id, checkout_attempt_id)` using `FOR UPDATE`
- if an existing pending row has the same `cart_fingerprint` and active/unexpired reservations, returns that order instead of creating a duplicate
- if an existing row has a different fingerprint, is canceled, paid, expired, or already belongs to a completed session, raises `checkout_attempt_conflict` so the client generates a new attempt id
- locks each variant row with `FOR UPDATE` in deterministic `variant_id` order
- rejects hidden, draft, archived, inactive, or non-purchasable products for non-admins
- checks active non-expired reservations against stock
- creates one `shop_orders` row with status `pending`
- creates `shop_order_items` snapshot rows from the locked product/variant data
- inserts reservation rows
- inserts `created` and `checkout_started` order events, with `customer_visible = true` only for the safe customer timeline event
- returns `order_id`, `order_number`, `checkout_attempt_id`, `reservation_expires_at`, `stripe_checkout_session_id`, `stripe_checkout_url`, subtotal, shipping-required flag, and line-item snapshots
- raises `insufficient_stock` with SQLSTATE `P0001` when unavailable

Add `shop_attach_checkout_session(p_order_id uuid, p_profile_id uuid, p_checkout_attempt_id text, p_stripe_checkout_session_id text, p_stripe_checkout_url text)` as a `SECURITY DEFINER SET search_path = public, pg_temp` function that:

- is granted only to `service_role`; the public client must never be able to attach arbitrary Stripe session ids
- verifies the order belongs to `p_profile_id`
- verifies the order's `checkout_attempt_id` matches `p_checkout_attempt_id`
- verifies the order is still `pending`
- stores `stripe_checkout_session_id` once
- stores `stripe_checkout_url` once
- raises a clear error if a different session is already attached

Add `shop_finalize_paid_order_from_checkout(p_event_id text, p_session jsonb)` as a `SECURITY DEFINER SET search_path = public, pg_temp` function that:

- inserts `shop_stripe_events.event_id` first and returns the current order state if already processed
- locks the order row by `stripe_checkout_session_id`
- verifies the order is `pending` or already `paid`
- locks active reservations for the order; if no active reservations exist for a not-yet-paid order, fail loudly so Stripe retries rather than silently marking paid without stock conversion
- decrements `shop_product_variants.stock_quantity` only once
- writes `shop_inventory_adjustments`
- marks reservations `converted`
- snapshots Stripe totals, billing/shipping addresses, customer details, checkout session id, payment intent id, and customer id
- marks the order `paid`
- inserts a customer-visible `payment_confirmed` event
- inserts deterministic pending `shop_order_notifications` rows for `customer_confirmation` and `internal_alert`

Add `shop_release_inventory_reservations(p_order_id uuid)` as a `SECURITY DEFINER SET search_path = public, pg_temp` function that marks active reservations `released`. Use it only for orders with no Stripe session attached or for explicit Stripe/session reconciliation paths.

Add `shop_release_order_for_checkout_session(p_event_id text, p_stripe_checkout_session_id text)` as a `SECURITY DEFINER SET search_path = public, pg_temp` function that records the Stripe event id, locks the order by session id, marks active reservations `released`, and marks still-pending orders `canceled`.

Add `shop_record_refund_event(p_event_id text, p_payload jsonb)` as a `SECURITY DEFINER SET search_path = public, pg_temp` function that records Stripe refund events idempotently and updates `shop_orders.status` to `partially_refunded` or `refunded` based on Stripe totals available in the payload.

After all functions are created, lock down execution:

```sql
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
```

- [ ] **Step 4: Review and apply migration locally**

Run:

```bash
rg -n "shop_|CREATE TYPE|CREATE TABLE|CREATE POLICY|CREATE OR REPLACE FUNCTION" supabase/migrations/20260508000002_shop_foundation.sql
```

Expected: all shop tables, types, policies, bucket, and RPCs are visible.

Apply it to the local Supabase database:

```bash
supabase migration up
```

Expected: migration applies without SQL errors.

Run a smoke check against the local database:

```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "select proname from pg_proc where proname like 'shop_%' order by proname;"
```

Expected: the checkout, reservation, finalization, release, and refund functions are listed.

Check RLS on internal tables:

```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "select relname, relrowsecurity from pg_class where relname in ('shop_stripe_events', 'shop_order_notifications');"
```

Expected: both rows have `relrowsecurity = t`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260508000002_shop_foundation.sql
git commit -m "feat: add shop database foundation"
```

### Task 1.2: Add TypeScript Shop Types

**Files:**
- Modify: `src/types/database.ts`
- Create: `src/lib/shop/types.ts`

- [ ] **Step 1: Add union types and interfaces**

Append to `src/types/database.ts`:

```ts
export type ShopProductType = "physical" | "digital" | "service";
export type ShopProductStatus = "draft" | "active" | "archived";
export type ShopProductVisibility = "public" | "members" | "hidden";
export type ShopPurchaseAccess = "public" | "members";
export type ShopOrderStatus =
  | "pending"
  | "paid"
  | "canceled"
  | "refunded"
  | "partially_refunded";
export type ShopFulfillmentStatus =
  | "unfulfilled"
  | "in_progress"
  | "fulfilled"
  | "partially_fulfilled"
  | "canceled";
export type ShopOrderItemFulfillmentType =
  | "physical"
  | "manual_digital"
  | "manual_service";
export type ShopReservationStatus =
  | "active"
  | "converted"
  | "released"
  | "expired";
export type ShopOrderEventType =
  | "created"
  | "checkout_started"
  | "payment_confirmed"
  | "payment_failed"
  | "checkout_expired"
  | "reservation_released"
  | "fulfillment_updated"
  | "tracking_updated"
  | "email_sent"
  | "email_failed"
  | "refund_updated"
  | "note";

export interface ShopProduct {
  id: string;
  title: string;
  slug: string;
  type: ShopProductType;
  status: ShopProductStatus;
  visibility: ShopProductVisibility;
  purchase_access: ShopPurchaseAccess;
  short_description: string;
  content_blocks: unknown[];
  stripe_tax_code: string | null;
  tax_behavior: "exclusive" | "inclusive";
  requires_shipping: boolean;
  requires_customer_notes: boolean;
  customer_notes_label: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}
```

Then add interfaces for `ShopProductVariant`, `ShopProductMedia`, `ShopInventoryReservation`, `ShopOrder`, `ShopOrderItem`, `ShopOrderEvent`, `ShopShippingZone`, `ShopShippingRate`, `ShopStripeEvent`, and `ShopOrderNotification` using the fields from the migration, including tax behavior, shipping zone `allowed_countries`, and order event `customer_visible`.

- [ ] **Step 2: Add shop helper types**

Create `src/lib/shop/types.ts`:

```ts
import type {
  Profile,
  ShopProduct,
  ShopProductMedia,
  ShopProductVariant,
} from "@/types/database";

export type ShopViewer = Pick<Profile, "id" | "role"> | null;

export interface ShopProductWithVariants extends ShopProduct {
  variants: ShopProductVariant[];
  media: ShopProductMedia[];
}

export interface CartLineInput {
  variantId: string;
  quantity: number;
}

export interface ValidatedCartLine {
  product: ShopProduct;
  variant: ShopProductVariant;
  quantity: number;
  lineSubtotalCents: number;
}

export interface CartValidationResult {
  lines: ValidatedCartLine[];
  subtotalCents: number;
  requiresShipping: boolean;
  customerNotesRequired: boolean;
}

export interface StartShopCheckoutInput {
  checkoutAttemptId: string;
  lines: CartLineInput[];
  customerNotes?: string;
}
```

- [ ] **Step 3: Run typecheck via unit test command**

Run:

```bash
npm run test:unit -- src/lib/data/profiles.ts
```

Expected: Vitest reports no matching tests for this file; this is acceptable only for this step because TypeScript compile errors would still surface when imported later. If the command errors due to no tests, proceed to the next typed helper tests.

- [ ] **Step 4: Commit**

```bash
git add src/types/database.ts src/lib/shop/types.ts
git commit -m "feat: add shop TypeScript types"
```

### Task 1.3: Add Money, Visibility, Content, And Reservation Helpers

**Files:**
- Create: `src/lib/shop/money.ts`
- Create: `src/lib/shop/money.test.ts`
- Create: `src/lib/shop/visibility.ts`
- Create: `src/lib/shop/visibility.test.ts`
- Create: `src/lib/shop/content-blocks.ts`
- Create: `src/lib/shop/content-blocks.test.ts`
- Create: `src/lib/shop/reservations.ts`
- Create: `src/lib/shop/reservations.test.ts`

- [ ] **Step 1: Write money tests**

Create `src/lib/shop/money.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatEuroCents, parseEuroCentsInput } from "./money";

describe("shop money helpers", () => {
  it("formats EUR cents using Portugal-friendly currency display", () => {
    expect(formatEuroCents(1299)).toBe("EUR 12.99");
  });

  it("parses decimal admin input into cents", () => {
    expect(parseEuroCentsInput("12.99")).toBe(1299);
    expect(parseEuroCentsInput("12,99")).toBe(1299);
  });

  it("rejects negative and invalid prices", () => {
    expect(() => parseEuroCentsInput("-1")).toThrow("Price must be zero or greater");
    expect(() => parseEuroCentsInput("abc")).toThrow("Enter a valid EUR price");
  });
});
```

- [ ] **Step 2: Implement money helpers**

Create `src/lib/shop/money.ts`:

```ts
const EURO_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "EUR",
  currencyDisplay: "code",
});

export function formatEuroCents(cents: number): string {
  if (!Number.isInteger(cents)) throw new Error("EUR cents must be an integer");
  return EURO_FORMATTER.format(cents / 100);
}

export function parseEuroCentsInput(input: string): number {
  const normalized = input.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    throw new Error("Enter a valid EUR price");
  }
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Price must be zero or greater");
  }
  return Math.round(amount * 100);
}
```

- [ ] **Step 3: Write visibility tests**

Create `src/lib/shop/visibility.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { ShopProduct } from "@/types/database";
import { canPurchaseProduct, canViewProduct } from "./visibility";

const baseProduct: ShopProduct = {
  id: "product-1",
  title: "Mask Tee",
  slug: "mask-tee",
  type: "physical",
  status: "active",
  visibility: "public",
  purchase_access: "members",
  short_description: "",
  content_blocks: [],
  stripe_tax_code: null,
  tax_behavior: "exclusive",
  requires_shipping: true,
  requires_customer_notes: false,
  customer_notes_label: "Anything we should know?",
  sort_order: 0,
  created_at: "2026-05-08T00:00:00.000Z",
  updated_at: "2026-05-08T00:00:00.000Z",
};

describe("shop visibility", () => {
  it("allows public users to view public active products but not buy member products", () => {
    expect(canViewProduct(baseProduct, null)).toBe(true);
    expect(canPurchaseProduct(baseProduct, null)).toBe(false);
  });

  it("allows members to view and buy member-access products", () => {
    expect(canPurchaseProduct(baseProduct, { id: "profile-1", role: "member" })).toBe(true);
  });

  it("keeps public-access products member-checkout only at launch", () => {
    expect(canPurchaseProduct({ ...baseProduct, purchase_access: "public" }, null)).toBe(false);
    expect(canPurchaseProduct({ ...baseProduct, purchase_access: "public" }, { id: "profile-1", role: "member" })).toBe(true);
  });

  it("hides member products from public users", () => {
    expect(canViewProduct({ ...baseProduct, visibility: "members" }, null)).toBe(false);
  });

  it("hides draft and hidden products from non-admins", () => {
    expect(canViewProduct({ ...baseProduct, status: "draft" }, { id: "p1", role: "member" })).toBe(false);
    expect(canViewProduct({ ...baseProduct, visibility: "hidden" }, { id: "p1", role: "member" })).toBe(false);
  });

  it("does not allow hidden products to be purchased by members through stale carts", () => {
    expect(canPurchaseProduct({ ...baseProduct, visibility: "hidden" }, { id: "p1", role: "member" })).toBe(false);
  });

  it("allows admins to view draft and hidden products", () => {
    expect(canViewProduct({ ...baseProduct, status: "draft", visibility: "hidden" }, { id: "admin", role: "admin" })).toBe(true);
  });
});
```

- [ ] **Step 4: Implement visibility helpers**

Create `src/lib/shop/visibility.ts`:

```ts
import type { ShopProduct } from "@/types/database";
import type { ShopViewer } from "./types";

function isAdmin(viewer: ShopViewer): boolean {
  return viewer?.role === "admin";
}

function isMemberOrAdmin(viewer: ShopViewer): boolean {
  return viewer?.role === "member" || viewer?.role === "admin";
}

export function canViewProduct(product: ShopProduct, viewer: ShopViewer): boolean {
  if (isAdmin(viewer)) return true;
  if (product.status !== "active") return false;
  if (product.visibility === "public") return true;
  if (product.visibility === "members") return isMemberOrAdmin(viewer);
  return false;
}

export function canPurchaseProduct(product: ShopProduct, viewer: ShopViewer): boolean {
  if (!canViewProduct(product, viewer)) return false;
  if (!isMemberOrAdmin(viewer)) return false;
  if (product.purchase_access === "public") return true;
  return isMemberOrAdmin(viewer);
}
```

- [ ] **Step 5: Write content block tests**

Create `src/lib/shop/content-blocks.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseShopContentBlocks } from "./content-blocks";

describe("shop content blocks", () => {
  it("accepts the launch block types", () => {
    const result = parseShopContentBlocks([
      { type: "rich_text", body: "Built for cold-water training." },
      { type: "specs", rows: [{ label: "Material", value: "Yamamoto neoprene" }] },
      { type: "bullets", title: "Best for", items: ["Freediving", "Pool training"] },
      { type: "media", mediaId: "media-1", caption: "Front view" },
    ]);
    expect(result).toHaveLength(4);
  });

  it("rejects unknown block types", () => {
    expect(() => parseShopContentBlocks([{ type: "unknown" }])).toThrow("Invalid product content");
  });
});
```

- [ ] **Step 6: Implement content block validation**

Create `src/lib/shop/content-blocks.ts`:

```ts
import { z } from "zod/v4";

const richTextBlockSchema = z.object({
  type: z.literal("rich_text"),
  body: z.string().trim().min(1).max(8000),
});

const mediaBlockSchema = z.object({
  type: z.literal("media"),
  mediaId: z.string().trim().min(1),
  caption: z.string().trim().max(300).optional(),
});

const specsBlockSchema = z.object({
  type: z.literal("specs"),
  rows: z.array(
    z.object({
      label: z.string().trim().min(1).max(80),
      value: z.string().trim().min(1).max(300),
    }),
  ).min(1).max(30),
});

const bulletsBlockSchema = z.object({
  type: z.literal("bullets"),
  title: z.string().trim().min(1).max(120),
  items: z.array(z.string().trim().min(1).max(240)).min(1).max(20),
});

const shopContentBlockSchema = z.discriminatedUnion("type", [
  richTextBlockSchema,
  mediaBlockSchema,
  specsBlockSchema,
  bulletsBlockSchema,
]);

export type ShopContentBlock = z.infer<typeof shopContentBlockSchema>;

export function parseShopContentBlocks(input: unknown): ShopContentBlock[] {
  const result = z.array(shopContentBlockSchema).safeParse(input);
  if (!result.success) {
    throw new Error(`Invalid product content: ${result.error.issues[0]?.message ?? "unknown error"}`);
  }
  return result.data;
}
```

- [ ] **Step 7: Add reservation helper tests and implementation**

Create `src/lib/shop/reservations.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SHOP_RESERVATION_TTL_MS, getReservationExpiry } from "./reservations";

describe("shop reservation helpers", () => {
  it("uses a 30 minute checkout reservation window to match Stripe Checkout minimum expiry", () => {
    expect(SHOP_RESERVATION_TTL_MS).toBe(30 * 60 * 1000);
  });

  it("calculates expiry from the supplied start date", () => {
    expect(getReservationExpiry(new Date("2026-05-08T10:00:00.000Z")).toISOString())
      .toBe("2026-05-08T10:30:00.000Z");
  });
});
```

Create `src/lib/shop/reservations.ts`:

```ts
export const SHOP_RESERVATION_TTL_MS = 30 * 60 * 1000;

export function getReservationExpiry(now = new Date()): Date {
  return new Date(now.getTime() + SHOP_RESERVATION_TTL_MS);
}
```

- [ ] **Step 8: Run focused helper tests**

Run:

```bash
npm run test:unit -- src/lib/shop/money.test.ts src/lib/shop/visibility.test.ts src/lib/shop/content-blocks.test.ts src/lib/shop/reservations.test.ts
```

Expected: all four test files pass.

- [ ] **Step 9: Commit**

```bash
git add src/lib/shop src/types/database.ts
git commit -m "feat: add shop domain helpers"
```

---

## Phase 2: Product Read Paths And Storefront Skeleton

**Goal:** Render public/member-aware product listing and product detail pages from Supabase data without cart or checkout yet.

**Gate:** Product data fetcher tests pass, `/shop` no longer shows the placeholder, and product visibility rules are enforced in fetchers and UI.

### Task 2.1: Add Product Data Fetchers

**Files:**
- Create: `src/lib/data/shop-products.ts`
- Create: `src/lib/data/shop-products.test.ts`

- [ ] **Step 1: Write fetcher tests**

Create tests that mock `@/lib/supabase/server` and `@/lib/data/profiles`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient } from "@/test/mocks/supabase";

const mockSupabase = createMockSupabaseClient();
vi.mock("@/lib/supabase/server", () => ({ createClient: () => mockSupabase.client }));
vi.mock("@/lib/data/profiles", () => ({ getProfile: vi.fn() }));

describe("shop product data fetchers", () => {
  beforeEach(() => {
    mockSupabase.mockQueryResult([]);
  });

  it("loads product listing ordered for storefront display", async () => {
    const { getShopProducts } = await import("./shop-products");
    await getShopProducts();
    expect(mockSupabase.client.from).toHaveBeenCalledWith("shop_products");
    expect(mockSupabase.query.order).toHaveBeenCalledWith("sort_order", { ascending: true });
  });

  it("loads a product by slug with variants and media", async () => {
    const { getShopProductBySlug } = await import("./shop-products");
    await getShopProductBySlug("mask-tee");
    expect(mockSupabase.query.eq).toHaveBeenCalledWith("slug", "mask-tee");
    expect(mockSupabase.query.maybeSingle).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Implement fetchers**

Create `src/lib/data/shop-products.ts`:

```ts
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/data/profiles";
import type { ShopProductWithVariants } from "@/lib/shop/types";

const PRODUCT_SELECT = `
  *,
  variants:shop_product_variants(*),
  media:shop_product_media(*)
`;

export const getShopProducts = cache(async function getShopProducts(): Promise<ShopProductWithVariants[]> {
  const profile = await getProfile();
  const supabase = await createClient();
  const visibility = profile ? ["public", "members"] : ["public"];

  const { data, error } = await supabase
    .from("shop_products")
    .select(PRODUCT_SELECT)
    .eq("status", "active")
    .in("visibility", visibility)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to load shop products: ${error.message}`);
  return (data ?? []) as ShopProductWithVariants[];
});

export const getShopProductBySlug = cache(async function getShopProductBySlug(
  slug: string,
): Promise<ShopProductWithVariants | null> {
  const profile = await getProfile();
  const supabase = await createClient();
  const visibility = profile ? ["public", "members"] : ["public"];

  const { data, error } = await supabase
    .from("shop_products")
    .select(PRODUCT_SELECT)
    .eq("slug", slug)
    .eq("status", "active")
    .in("visibility", visibility)
    .maybeSingle();

  if (error) throw new Error(`Failed to load shop product: ${error.message}`);
  return (data ?? null) as ShopProductWithVariants | null;
});
```

- [ ] **Step 3: Run tests**

```bash
npm run test:unit -- src/lib/data/shop-products.test.ts
```

Expected: fetcher tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/data/shop-products.ts src/lib/data/shop-products.test.ts
git commit -m "feat: add shop product data fetchers"
```

### Task 2.2: Build Product Listing UI

**Files:**
- Replace: `src/app/(marketing)/shop/page.tsx`
- Create: `src/components/shop/ProductGrid.tsx`
- Create: `src/components/shop/ProductCard.tsx`
- Modify: `src/components/layout/Navbar.tsx`

- [ ] **Step 1: Add ProductCard**

Create `src/components/shop/ProductCard.tsx`:

```tsx
import Link from "next/link";
import type { ShopProductWithVariants } from "@/lib/shop/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatEuroCents } from "@/lib/shop/money";

export function ProductCard({ product }: { product: ShopProductWithVariants }) {
  const primaryMedia = product.media.find((item) => item.is_primary) ?? product.media[0];
  const firstVariant = product.variants.find((variant) => variant.active) ?? product.variants[0];

  return (
    <Link href={`/shop/${product.slug}`} className="group block">
      <Card className="h-full overflow-hidden">
        <div className="aspect-[4/5] bg-muted">
          {primaryMedia?.public_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={primaryMedia.public_url}
              alt={primaryMedia.alt_text || product.title}
              className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
            />
          ) : null}
        </div>
        <CardContent className="space-y-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-base font-medium text-foreground">{product.title}</h2>
            <Badge variant="outline" className="capitalize">{product.type}</Badge>
          </div>
          <p className="line-clamp-2 text-sm text-muted-foreground">{product.short_description}</p>
          <p className="text-sm font-medium text-foreground">
            {firstVariant ? formatEuroCents(firstVariant.price_cents) : "Coming soon"}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
```

- [ ] **Step 2: Add ProductGrid**

Create `src/components/shop/ProductGrid.tsx`:

```tsx
import type { ShopProductWithVariants } from "@/lib/shop/types";
import { ProductCard } from "./ProductCard";

export function ProductGrid({ products }: { products: ShopProductWithVariants[] }) {
  if (products.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        No shop products are available right now.
      </div>
    );
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Replace shop placeholder page**

Replace `src/app/(marketing)/shop/page.tsx`:

```tsx
import { ProductGrid } from "@/components/shop/ProductGrid";
import { getShopProducts } from "@/lib/data/shop-products";

export default async function ShopPage() {
  const products = await getShopProducts();

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-12 md:py-16">
      <div className="mb-8 flex flex-col gap-3">
        <h1 className="text-[length:var(--font-size-h1)] font-medium text-foreground">
          Shop
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          Member-focused gear, tools, digital resources, and services from Behind The Mask.
        </p>
      </div>
      <ProductGrid products={products} />
    </div>
  );
}
```

- [ ] **Step 4: Add Shop to navbar**

In `src/components/layout/Navbar.tsx`, add:

```ts
{ label: "Shop", href: "/shop" },
```

to `NAV_LINKS`, after `Partners`.

- [ ] **Step 5: Run focused tests and lint on touched files**

```bash
npm run test:unit -- src/lib/shop/money.test.ts src/lib/data/shop-products.test.ts
npm run lint -- src/app/(marketing)/shop/page.tsx src/components/shop/ProductGrid.tsx src/components/shop/ProductCard.tsx src/components/layout/Navbar.tsx
```

Expected: tests pass and lint reports no errors. If the shell treats parentheses specially, quote route paths.

- [ ] **Step 6: Commit**

```bash
git add 'src/app/(marketing)/shop/page.tsx' src/components/shop/ProductGrid.tsx src/components/shop/ProductCard.tsx src/components/layout/Navbar.tsx
git commit -m "feat: add shop product listing"
```

### Task 2.3: Build Product Detail Read Page

**Files:**
- Create: `src/app/(marketing)/shop/[slug]/page.tsx`
- Create: `src/components/shop/ProductDetail.tsx`
- Create: `src/components/shop/ProductGallery.tsx`
- Create: `src/components/shop/ProductPurchasePanel.tsx`
- Create: `src/components/shop/RichContentBlocks.tsx`

- [ ] **Step 1: Add product detail page**

Create `src/app/(marketing)/shop/[slug]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { ProductDetail } from "@/components/shop/ProductDetail";
import { getShopProductBySlug } from "@/lib/data/shop-products";

export default async function ShopProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await getShopProductBySlug(slug);
  if (!product) notFound();
  return <ProductDetail product={product} />;
}
```

- [ ] **Step 2: Add gallery and rich block renderers**

Create `src/components/shop/ProductGallery.tsx`:

```tsx
import type { ShopProductMedia } from "@/types/database";

export function ProductGallery({ media, title }: { media: ShopProductMedia[]; title: string }) {
  const ordered = [...media].sort((a, b) => a.sort_order - b.sort_order);
  const primary = ordered.find((item) => item.is_primary) ?? ordered[0];

  return (
    <div className="grid gap-3">
      <div className="aspect-[4/5] overflow-hidden rounded-lg bg-muted">
        {primary?.public_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={primary.public_url} alt={primary.alt_text || title} className="h-full w-full object-cover" />
        ) : null}
      </div>
      {ordered.length > 1 && (
        <div className="grid grid-cols-4 gap-2">
          {ordered.slice(0, 4).map((item) => (
            <div key={item.id} className="aspect-square overflow-hidden rounded-md bg-muted">
              {item.public_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.public_url} alt={item.alt_text || title} className="h-full w-full object-cover" />
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

Create `src/components/shop/RichContentBlocks.tsx`:

```tsx
import { parseShopContentBlocks } from "@/lib/shop/content-blocks";

export function RichContentBlocks({ blocks }: { blocks: unknown[] }) {
  const parsed = parseShopContentBlocks(blocks);
  if (parsed.length === 0) return null;

  return (
    <div className="mt-12 space-y-8">
      {parsed.map((block, index) => {
        if (block.type === "rich_text") {
          return <p key={index} className="max-w-3xl text-muted-foreground">{block.body}</p>;
        }
        if (block.type === "bullets") {
          return (
            <section key={index}>
              <h2 className="mb-3 text-lg font-medium text-foreground">{block.title}</h2>
              <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
                {block.items.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </section>
          );
        }
        if (block.type === "specs") {
          return (
            <dl key={index} className="grid max-w-2xl divide-y divide-border rounded-lg border border-border">
              {block.rows.map((row) => (
                <div key={row.label} className="grid grid-cols-3 gap-4 px-4 py-3">
                  <dt className="text-sm text-muted-foreground">{row.label}</dt>
                  <dd className="col-span-2 text-sm text-foreground">{row.value}</dd>
                </div>
              ))}
            </dl>
          );
        }
        return null;
      })}
    </div>
  );
}
```

- [ ] **Step 3: Add purchase panel read-only shell**

Create `src/components/shop/ProductPurchasePanel.tsx`:

```tsx
import type { ShopProductWithVariants } from "@/lib/shop/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatEuroCents } from "@/lib/shop/money";

export function ProductPurchasePanel({ product }: { product: ShopProductWithVariants }) {
  const activeVariants = product.variants.filter((variant) => variant.active);
  const firstVariant = activeVariants[0];

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="capitalize">{product.type}</Badge>
          {product.purchase_access === "members" && <Badge>Members only checkout</Badge>}
        </div>
        <h1 className="text-[length:var(--font-size-h1)] font-medium text-foreground">{product.title}</h1>
        <p className="text-muted-foreground">{product.short_description}</p>
        <p className="text-2xl font-medium text-foreground">
          {firstVariant ? formatEuroCents(firstVariant.price_cents) : "Coming soon"}
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        Prices are charged in EUR. Taxes are calculated at checkout.
      </div>

      <Button type="button" disabled className="w-full">
        Cart coming in next phase
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Add ProductDetail layout**

Create `src/components/shop/ProductDetail.tsx`:

```tsx
import type { ShopProductWithVariants } from "@/lib/shop/types";
import { ProductGallery } from "./ProductGallery";
import { ProductPurchasePanel } from "./ProductPurchasePanel";
import { RichContentBlocks } from "./RichContentBlocks";

export function ProductDetail({ product }: { product: ShopProductWithVariants }) {
  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-12 md:py-16">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
        <ProductGallery media={product.media} title={product.title} />
        <ProductPurchasePanel product={product} />
      </div>
      <RichContentBlocks blocks={product.content_blocks} />
    </div>
  );
}
```

- [ ] **Step 5: Run focused checks**

```bash
npm run test:unit -- src/lib/shop/content-blocks.test.ts src/lib/data/shop-products.test.ts
npm run lint -- 'src/app/(marketing)/shop/[slug]/page.tsx' src/components/shop/ProductDetail.tsx src/components/shop/ProductGallery.tsx src/components/shop/ProductPurchasePanel.tsx src/components/shop/RichContentBlocks.tsx
```

Expected: tests pass and lint reports no errors.

- [ ] **Step 6: Commit**

```bash
git add 'src/app/(marketing)/shop/[slug]/page.tsx' src/components/shop/ProductDetail.tsx src/components/shop/ProductGallery.tsx src/components/shop/ProductPurchasePanel.tsx src/components/shop/RichContentBlocks.tsx
git commit -m "feat: add shop product detail page"
```

---

## Phase 3: Admin Product Management, Media, And Shipping

**Goal:** Let admins create and edit products, variants, shipping rates, media, and rich content from the existing admin dashboard.

**Gate:** Admin action tests pass, admins can create a draft product with one variant, upload media metadata, publish it, and see it on `/shop`.

This phase is intentionally split into narrow checkpoints:

- Phase 3A: product and variant mutations/actions.
- Phase 3B: product and variant admin UI.
- Phase 3C: media upload, rich content editor, and shipping-rate UI.

### Task 3.1: Add Admin Data Mutations

**Files:**
- Create: `src/lib/data/shop-admin.ts`
- Create: `src/lib/data/shop-admin.test.ts`
- Create: `src/app/(dashboard)/admin/shop/actions.ts`
- Create: `src/app/(dashboard)/admin/shop/actions.test.ts`

- [ ] **Step 1: Write admin data tests**

Create tests that assert `requireAdmin()` is called and Supabase writes target the correct tables:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient } from "@/test/mocks/supabase";

const mockSupabase = createMockSupabaseClient();
vi.mock("@/lib/supabase/server", () => ({ createClient: () => mockSupabase.client }));
vi.mock("@/lib/auth/require-admin", () => ({ requireAdmin: vi.fn().mockResolvedValue({ id: "admin-1", role: "admin" }) }));

describe("shop admin data mutations", () => {
  beforeEach(() => mockSupabase.mockQueryResult({ id: "product-1" }));

  it("creates products through shop_products", async () => {
    const { createShopProduct } = await import("./shop-admin");
    await createShopProduct({
      title: "Mask Tee",
      slug: "mask-tee",
      type: "physical",
      visibility: "members",
      purchaseAccess: "members",
      shortDescription: "BTM shirt",
    });
    expect(mockSupabase.client.from).toHaveBeenCalledWith("shop_products");
    expect(mockSupabase.query.insert).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Implement admin data mutations**

Create `src/lib/data/shop-admin.ts` with functions:

```ts
import { requireAdmin } from "@/lib/auth/require-admin";
import { createClient } from "@/lib/supabase/server";
import { parseShopContentBlocks } from "@/lib/shop/content-blocks";
import type { ShopProductType, ShopProductVisibility, ShopPurchaseAccess } from "@/types/database";

export async function createShopProduct(input: {
  title: string;
  slug: string;
  type: ShopProductType;
  visibility: ShopProductVisibility;
  purchaseAccess: ShopPurchaseAccess;
  shortDescription: string;
}) {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shop_products")
    .insert({
      title: input.title,
      slug: input.slug,
      type: input.type,
      visibility: input.visibility,
      purchase_access: input.purchaseAccess,
      short_description: input.shortDescription,
      requires_shipping: input.type === "physical",
    })
    .select("*")
    .single();

  if (error) throw new Error(`Failed to create product: ${error.message}`);
  return data;
}

export async function updateShopProductContent(productId: string, blocks: unknown[]) {
  await requireAdmin();
  const contentBlocks = parseShopContentBlocks(blocks);
  const supabase = await createClient();
  const { error } = await supabase
    .from("shop_products")
    .update({ content_blocks: contentBlocks, updated_at: new Date().toISOString() })
    .eq("id", productId);
  if (error) throw new Error(`Failed to update product content: ${error.message}`);
}
```

Also add functions for `updateShopProduct`, `createShopVariant`, `updateShopVariant`, `recordShopProductMedia`, `deleteShopProductMedia`, `upsertShippingRate`, and `updateOrderFulfillment`.

- [ ] **Step 3: Write server action tests**

Create `src/app/(dashboard)/admin/shop/actions.test.ts` with tests for invalid input and successful product creation:

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/data/shop-admin", () => ({
  createShopProduct: vi.fn().mockResolvedValue({ id: "product-1" }),
}));

describe("shop admin actions", () => {
  it("returns validation errors for missing title", async () => {
    const { createShopProductAction } = await import("./actions");
    const result = await createShopProductAction({
      title: "",
      slug: "mask-tee",
      type: "physical",
      visibility: "members",
      purchaseAccess: "members",
      shortDescription: "",
    });
    expect(result.errors.title).toBeDefined();
  });
});
```

- [ ] **Step 4: Implement server actions**

Create `src/app/(dashboard)/admin/shop/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { createShopProduct } from "@/lib/data/shop-admin";

const productInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(160),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use a URL-safe slug"),
  type: z.enum(["physical", "digital", "service"]),
  visibility: z.enum(["public", "members", "hidden"]),
  purchaseAccess: z.enum(["public", "members"]),
  shortDescription: z.string().trim().max(500),
});

export async function createShopProductAction(input: unknown) {
  const parsed = productInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      errors: Object.fromEntries(parsed.error.issues.map((issue) => [issue.path.join("."), [issue.message]])),
      message: "Check the product fields.",
    };
  }
  const product = await createShopProduct(parsed.data);
  revalidatePath("/admin");
  revalidatePath("/shop");
  return { productId: product.id, errors: {}, message: "Product created." };
}
```

- [ ] **Step 5: Run tests**

```bash
npm run test:unit -- src/lib/data/shop-admin.test.ts 'src/app/(dashboard)/admin/shop/actions.test.ts'
```

Expected: admin data/action tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/data/shop-admin.ts src/lib/data/shop-admin.test.ts 'src/app/(dashboard)/admin/shop/actions.ts' 'src/app/(dashboard)/admin/shop/actions.test.ts'
git commit -m "feat: add shop admin mutations"
```

### Task 3.2: Add Admin Product And Variant UI

**Files:**
- Modify: `src/app/(dashboard)/admin/admin-dashboard.tsx`
- Create: `src/app/(dashboard)/admin/shop/shop-admin.tsx`
- Create: `src/app/(dashboard)/admin/shop/products-panel.tsx`
- Create: `src/app/(dashboard)/admin/shop/product-editor.tsx`

- [ ] **Step 1: Add admin dashboard tab**

Modify `src/app/(dashboard)/admin/admin-dashboard.tsx`:

```tsx
const ShopAdmin = dynamic(
  () => import("./shop/shop-admin").then((module) => module.ShopAdmin),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-md border border-border bg-card p-6 text-sm text-muted-foreground">
        Loading shop admin...
      </div>
    ),
  },
);

type Tab = "contacts" | "tags" | "email" | "shop";
```

Add `{ key: "shop", label: "Shop" }` to `TABS`, track `hasVisitedShop`, and render:

```tsx
{(activeTab === "shop" || hasVisitedShop) && (
  <div hidden={activeTab !== "shop"}>
    <ShopAdmin isVisible={activeTab === "shop"} />
  </div>
)}
```

- [ ] **Step 2: Build initial ShopAdmin shell**

Create `src/app/(dashboard)/admin/shop/shop-admin.tsx`:

```tsx
"use client";

import { ProductsPanel } from "./products-panel";

export function ShopAdmin({ isVisible }: { isVisible: boolean }) {
  if (!isVisible) return null;

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-medium text-foreground">Shop</h1>
        <p className="text-sm text-muted-foreground">Manage products, inventory, shipping, and orders.</p>
      </div>
      <div className="flex gap-2 border-b border-border pb-3">
        <button type="button" className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground">
          Products
        </button>
      </div>
      <ProductsPanel />
    </section>
  );
}
```

- [ ] **Step 3: Add product and variant editor panels**

Implement `ProductsPanel` and `ProductEditor` as client components using existing `Button`, `Card`, `Input`-style native inputs, `Select`, and `Table`. This checkpoint must support:

- create product
- edit title/slug/status/type/visibility/access/description
- create/edit variants with price/stock

- [ ] **Step 4: Run lint**

```bash
npm run lint -- 'src/app/(dashboard)/admin/admin-dashboard.tsx' 'src/app/(dashboard)/admin/shop'
```

Expected: lint reports no errors.

- [ ] **Step 5: Commit**

```bash
git add 'src/app/(dashboard)/admin/admin-dashboard.tsx' 'src/app/(dashboard)/admin/shop'
git commit -m "feat: add shop admin product UI"
```

### Task 3.3: Add Admin Media, Rich Content, And Shipping UI

**Files:**
- Create: `src/app/(dashboard)/admin/shop/product-media-uploader.tsx`
- Create: `src/app/(dashboard)/admin/shop/rich-content-editor.tsx`
- Create: `src/app/(dashboard)/admin/shop/shipping-rates-panel.tsx`
- Modify: `src/app/(dashboard)/admin/shop/product-editor.tsx`
- Modify: `src/app/(dashboard)/admin/shop/shop-admin.tsx`

- [ ] **Step 1: Add focused tests for media/content/shipping actions**

Add or extend `src/app/(dashboard)/admin/shop/actions.test.ts` so it covers:

- image metadata validation before recording media
- rich content validation through `parseShopContentBlocks`
- shipping zone country lists and active rate validation

- [ ] **Step 2: Implement media uploader**

`ProductMediaUploader` must upload only JPEG, PNG, or WebP files to the `shop-product-media` bucket, reject files larger than 10 MB before upload, then call the admin action that records `shop_product_media` metadata. Storage object upload is allowed only by the admin storage policies from Task 1.1.

- [ ] **Step 3: Implement rich content editor**

`RichContentEditor` must provide structured controls for `rich_text`, `bullets`, and `specs` blocks. Save through the admin action that validates with `parseShopContentBlocks`.

- [ ] **Step 4: Implement shipping rates panel**

`ShippingRatesPanel` must manage zones for Portugal, EU, UK, USA/Canada, and Rest of World. Each zone stores explicit `allowed_countries`; do not rely on a wildcard because Stripe Checkout requires an explicit allowed-country list. Launch admins can keep Rest of World inactive until they have a supported-country list.

- [ ] **Step 5: Add media/content/shipping tabs**

Modify `ShopAdmin` to introduce tabs for `products` and `shipping`, and render the media/content editor inside `ProductEditor` so product editing stays in one workflow.

- [ ] **Step 6: Run tests and lint**

```bash
npm run test:unit -- 'src/app/(dashboard)/admin/shop/actions.test.ts' src/lib/data/shop-admin.test.ts
npm run lint -- 'src/app/(dashboard)/admin/shop'
```

Expected: tests pass and lint reports no errors.

- [ ] **Step 7: Commit**

```bash
git add 'src/app/(dashboard)/admin/shop'
git commit -m "feat: add shop admin media content and shipping"
```

---

## Phase 4: Cart And Checkout Reservations

**Goal:** Add a custom local cart and server-side checkout validation/reservation flow without Stripe payment finalization yet.

**Gate:** Cart store tests and checkout validation tests pass; a member can reach checkout validation and receive clear errors for unavailable items.

### Task 4.1: Add Custom Cart Store

**Files:**
- Create: `src/components/shop/cart-store.ts`
- Create: `src/components/shop/cart-store.test.ts`
- Create: `src/components/shop/CartButton.tsx`
- Create: `src/components/shop/CartReview.tsx`
- Create: `src/app/(marketing)/shop/cart/page.tsx`

- [ ] **Step 1: Write cart store tests**

Create `src/components/shop/cart-store.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { addCartLine, clearCart, getCartSnapshot, removeCartLine, updateCartQuantity } from "./cart-store";

describe("shop cart store", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
    clearCart();
  });

  it("adds and merges cart lines by variant id", () => {
    addCartLine("variant-1", 1);
    addCartLine("variant-1", 2);
    expect(getCartSnapshot()).toEqual([{ variantId: "variant-1", quantity: 3 }]);
  });

  it("removes lines when quantity is zero", () => {
    addCartLine("variant-1", 1);
    updateCartQuantity("variant-1", 0);
    expect(getCartSnapshot()).toEqual([]);
  });
});
```

- [ ] **Step 2: Implement cart store**

Create `src/components/shop/cart-store.ts`:

```ts
import { useSyncExternalStore } from "react";
import type { CartLineInput } from "@/lib/shop/types";

const STORAGE_KEY = "btm-shop-cart-v1";
let listeners = new Set<() => void>();
let memoryCart: CartLineInput[] = [];

function readStorage(): CartLineInput[] {
  if (typeof window === "undefined") return memoryCart;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CartLineInput[];
    return parsed.filter((line) => typeof line.variantId === "string" && Number.isInteger(line.quantity) && line.quantity > 0);
  } catch {
    return [];
  }
}

function writeStorage(lines: CartLineInput[]) {
  memoryCart = lines;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
  }
  listeners.forEach((listener) => listener());
}

export function getCartSnapshot(): CartLineInput[] {
  return readStorage();
}

export function subscribeCart(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCartLines() {
  return useSyncExternalStore(subscribeCart, getCartSnapshot, () => []);
}

export function addCartLine(variantId: string, quantity: number) {
  const current = readStorage();
  const existing = current.find((line) => line.variantId === variantId);
  const next = existing
    ? current.map((line) => line.variantId === variantId ? { ...line, quantity: line.quantity + quantity } : line)
    : [...current, { variantId, quantity }];
  writeStorage(next.filter((line) => line.quantity > 0));
}

export function updateCartQuantity(variantId: string, quantity: number) {
  writeStorage(readStorage().map((line) => line.variantId === variantId ? { ...line, quantity } : line).filter((line) => line.quantity > 0));
}

export function removeCartLine(variantId: string) {
  writeStorage(readStorage().filter((line) => line.variantId !== variantId));
}

export function clearCart() {
  writeStorage([]);
}
```

- [ ] **Step 3: Add checkout attempt id helper**

Extend `cart-store.ts` with a checkout attempt id helper so double-clicks and retries reuse one attempt for the same cart contents:

```ts
const CHECKOUT_ATTEMPT_KEY = "btm-shop-checkout-attempt-v1";

export function getOrCreateCheckoutAttemptId(): string {
  if (typeof window === "undefined") return crypto.randomUUID();
  const current = window.localStorage.getItem(CHECKOUT_ATTEMPT_KEY);
  if (current) return current;
  const next = crypto.randomUUID();
  window.localStorage.setItem(CHECKOUT_ATTEMPT_KEY, next);
  return next;
}

export function resetCheckoutAttemptId() {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(CHECKOUT_ATTEMPT_KEY);
  }
}
```

Call `resetCheckoutAttemptId()` whenever cart contents change after a successful add/update/remove, after a paid order is confirmed and the cart is cleared, or after the app explicitly cancels/releases the attached Checkout Session. Do not reset the attempt id before redirecting to Stripe; cancel/return/retry must reuse the same attempt id and existing Checkout Session URL for the unchanged cart.

- [ ] **Step 4: Wire add-to-cart UI into product detail**

Change `ProductPurchasePanel` into a client component that:

- lets users select active variant
- lets users choose quantity
- calls `addCartLine`
- links to `/shop/cart`

- [ ] **Step 5: Add cart review page**

Create a cart page that reads local cart client-side and uses a server action in the next task for validation. It must show an empty state and a "Continue checkout" button.

- [ ] **Step 6: Run tests**

```bash
npm run test:unit -- src/components/shop/cart-store.test.ts
```

Expected: cart tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/shop/cart-store.ts src/components/shop/cart-store.test.ts src/components/shop/CartButton.tsx src/components/shop/CartReview.tsx 'src/app/(marketing)/shop/cart/page.tsx' src/components/shop/ProductPurchasePanel.tsx
git commit -m "feat: add shop cart"
```

### Task 4.2: Add Server Cart Validation And Reservation Creation

**Files:**
- Create: `src/lib/shop/cart-validation.ts`
- Create: `src/lib/shop/cart-validation.test.ts`
- Create: `src/lib/shop/checkout.ts`
- Create: `src/lib/shop/checkout.test.ts`
- Create: `src/app/(marketing)/shop/actions.ts`
- Create: `src/app/(marketing)/shop/actions.test.ts`
- Create: `src/app/(marketing)/shop/checkout/page.tsx`

- [ ] **Step 1: Write cart validation tests**

Create tests covering:

- empty cart fails with `"Your cart is empty."`
- inactive variant fails
- draft/hidden product fails
- member-only purchase fails for no profile
- insufficient stock fails using `stock_quantity - active_reserved_quantity`
- valid cart returns subtotal and requires shipping when any physical product exists

- [ ] **Step 2: Implement cart validation**

Implement:

```ts
export function validateCartForCheckout(input: {
  lines: CartLineInput[];
  productsByVariantId: Map<string, { product: ShopProduct; variant: ShopProductVariant; activeReservedQuantity: number }>;
  viewer: ShopViewer;
}): CartValidationResult
```

Use `canPurchaseProduct`, integer quantity validation, active variant checks, and stock checks.

- [ ] **Step 3: Write checkout orchestration tests**

Mock `createClient`, `getProfile`, `validateCartForCheckout`, and Stripe builder. Assert:

- unauthenticated users receive login-required error
- successful checkout calls `shop_begin_checkout`
- repeated calls with the same `checkoutAttemptId` do not create duplicate reservations
- a reused `checkoutAttemptId` with changed cart contents returns a clear conflict error
- cancel/return/retry with the same unchanged cart reuses the existing `checkoutAttemptId` and returns the existing `stripe_checkout_url`
- reservation expiry uses 30 minutes
- hidden products are rejected through `validateCartForCheckout`

- [ ] **Step 4: Implement checkout orchestration**

Implement `startShopCheckout(input)` in `src/lib/shop/checkout.ts`:

- validates profile role
- loads variants/products
- validates cart
- passes `checkoutAttemptId` to `shop_begin_checkout`
- calls `shop_begin_checkout` so order creation, item snapshots, and reservations happen in one database transaction
- returns `{ orderId, orderNumber, reservationExpiresAt }` for now

- [ ] **Step 5: Add checkout server action**

Create `startShopCheckoutAction` in `src/app/(marketing)/shop/actions.ts`:

```ts
"use server";

import { z } from "zod/v4";
import { startShopCheckout } from "@/lib/shop/checkout";

const checkoutInputSchema = z.object({
  checkoutAttemptId: z.string().trim().min(8).max(80),
  lines: z.array(z.object({
    variantId: z.string().min(1),
    quantity: z.number().int().positive().max(99),
  })).min(1),
  customerNotes: z.string().trim().max(2000).optional(),
});

export async function startShopCheckoutAction(input: unknown) {
  const parsed = checkoutInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid checkout request" };
  }
  const result = await startShopCheckout(parsed.data);
  return { ok: true, orderId: result.orderId, orderNumber: result.orderNumber };
}
```

- [ ] **Step 6: Run tests**

```bash
npm run test:unit -- src/lib/shop/cart-validation.test.ts src/lib/shop/checkout.test.ts 'src/app/(marketing)/shop/actions.test.ts'
```

Expected: validation/action tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/shop/cart-validation.ts src/lib/shop/cart-validation.test.ts src/lib/shop/checkout.ts src/lib/shop/checkout.test.ts 'src/app/(marketing)/shop/actions.ts' 'src/app/(marketing)/shop/actions.test.ts' 'src/app/(marketing)/shop/checkout/page.tsx'
git commit -m "feat: add shop checkout reservations"
```

---

## Phase 5: Stripe Checkout And Webhook Finalization

**Goal:** Create Stripe Checkout Sessions with automatic tax and finalize paid orders through verified webhooks.

**Gate:** Stripe payload tests and webhook tests pass; checkout redirects to Stripe in test mode; successful webhook converts reservations and marks orders paid.

### Task 5.1: Add Stripe Integration

**Files:**
- Create: `src/lib/shop/stripe.ts`
- Create: `src/lib/shop/stripe.test.ts`
- Modify: `src/lib/shop/checkout.ts`
- Modify: `src/lib/shop/checkout.test.ts`
- Modify: `src/app/(marketing)/shop/actions.ts`
- Modify: `src/app/(marketing)/shop/actions.test.ts`
- Modify: `src/components/shop/CartReview.tsx`

- [ ] **Step 1: Install Stripe package if absent**

Check `package.json`. If `stripe` is not installed, run:

```bash
npm install stripe
```

Expected: `package.json` and `package-lock.json` include `stripe`.

- [ ] **Step 2: Write Stripe payload tests**

Create tests asserting:

- Checkout Session mode is `payment`
- currency is `eur`
- `automatic_tax.enabled` is `true`
- physical carts include shipping address collection and shipping options
- payment methods are restricted to `card` for launch
- `expires_at` matches the 30-minute reservation expiry
- metadata includes `orderId`
- allowed countries come from active shipping zone configuration, not a hardcoded country subset

- [ ] **Step 3: Implement Stripe helpers**

Create `src/lib/shop/stripe.ts`:

```ts
import Stripe from "stripe";
import { getPublicSiteUrl } from "@/lib/email/settings";

export function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) throw new Error("Missing STRIPE_SECRET_KEY");
  return new Stripe(secretKey);
}

export function getStripeWebhookSecret() {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) throw new Error("Missing STRIPE_WEBHOOK_SECRET");
  return secret;
}

export function buildCheckoutSessionParams(input: {
  orderId: string;
  lineItems: Stripe.Checkout.SessionCreateParams.LineItem[];
  customerEmail: string;
  expiresAtUnix: number;
  requiresShipping: boolean;
  allowedShippingCountries: Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[];
  shippingOptions: Stripe.Checkout.SessionCreateParams.ShippingOption[];
}): Stripe.Checkout.SessionCreateParams {
  const siteUrl = getPublicSiteUrl();
  return {
    mode: "payment",
    payment_method_types: ["card"],
    customer_email: input.customerEmail,
    line_items: input.lineItems,
    automatic_tax: { enabled: true },
    expires_at: input.expiresAtUnix,
    success_url: `${siteUrl}/shop/success?order=${input.orderId}`,
    cancel_url: `${siteUrl}/shop/canceled?order=${input.orderId}`,
    metadata: { orderId: input.orderId },
    shipping_address_collection: input.requiresShipping
      ? { allowed_countries: input.allowedShippingCountries }
      : undefined,
    shipping_options: input.requiresShipping ? input.shippingOptions : undefined,
  };
}

export async function createCheckoutSession(input: {
  stripe: Stripe;
  profileId: string;
  checkoutAttemptId: string;
  params: Stripe.Checkout.SessionCreateParams;
}) {
  return input.stripe.checkout.sessions.create(input.params, {
    idempotencyKey: `shop-checkout:${input.profileId}:${input.checkoutAttemptId}`,
  });
}
```

- [ ] **Step 4: Update checkout orchestration to create Stripe session**

Modify `startShopCheckout` to:

- create Stripe line items from validated cart snapshots
- include product/variant Stripe tax codes in line-item `price_data.product_data.tax_code` where configured
- load active flat shipping zones/rates when `requiresShipping`; build `allowedShippingCountries` from `shop_shipping_zones.allowed_countries`; fail loudly if no active configured country can ship
- create Stripe Checkout Session with idempotency key `shop-checkout:${profileId}:${checkoutAttemptId}`
- call `shop_attach_checkout_session` with `createAdminClient()` to store `stripe_checkout_session_id` and `stripe_checkout_url`
- if Stripe session creation fails after `shop_begin_checkout`, call `shop_release_inventory_reservations(orderId)` with the service role before returning a visible checkout error
- return `{ orderId, checkoutUrl }`

- [ ] **Step 5: Update checkout action and UI redirect**

Modify `startShopCheckoutAction` to return `checkoutUrl`:

```ts
const result = await startShopCheckout(parsed.data);
return { ok: true, orderId: result.orderId, checkoutUrl: result.checkoutUrl };
```

Modify `CartReview` so the checkout button sends `checkoutAttemptId: getOrCreateCheckoutAttemptId()` and redirects with:

```ts
if (result.ok && result.checkoutUrl) {
  window.location.assign(result.checkoutUrl);
}
```

Do not call `resetCheckoutAttemptId()` here. The same cart must keep the same attempt id through Stripe cancel/return/retry. Reset it only when the cart changes, when the user explicitly starts a fresh checkout after cancellation/release, or when the paid order is confirmed and the cart is cleared.

- [ ] **Step 6: Run tests**

```bash
npm run test:unit -- src/lib/shop/stripe.test.ts src/lib/shop/checkout.test.ts 'src/app/(marketing)/shop/actions.test.ts'
```

Expected: Stripe and checkout tests pass.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/lib/shop/stripe.ts src/lib/shop/stripe.test.ts src/lib/shop/checkout.ts src/lib/shop/checkout.test.ts 'src/app/(marketing)/shop/actions.ts' 'src/app/(marketing)/shop/actions.test.ts' src/components/shop/CartReview.tsx
git commit -m "feat: create stripe checkout sessions"
```

### Task 5.2: Add Stripe Webhook Route

**Files:**
- Create: `src/app/api/shop/stripe/webhook/route.ts`
- Create: `src/app/api/shop/stripe/webhook/route.test.ts`
- Modify: `src/lib/data/shop-orders.ts`
- Modify: `src/lib/data/shop-orders.test.ts`

- [ ] **Step 1: Write order finalization data tests**

Add tests for:

- `finalizeShopOrderPaidFromCheckoutSession` calls `shop_finalize_paid_order_from_checkout`
- duplicate webhook processing is idempotent through `shop_stripe_events.event_id`
- failed email/order events are recorded with `shop_order_events`
- `releaseShopOrderReservationsForCheckoutSession` calls `shop_release_order_for_checkout_session`
- `recordShopRefundEvent` calls `shop_record_refund_event`

- [ ] **Step 2: Implement order finalization data helpers**

In `src/lib/data/shop-orders.ts`, add narrow wrappers around the service-role RPCs:

```ts
export async function finalizeShopOrderPaidFromCheckoutSession(input: {
  eventId: string;
  session: Record<string, unknown>;
}) {
  const supabase = await createAdminClient();
  const { data, error } = await supabase.rpc("shop_finalize_paid_order_from_checkout", {
    p_event_id: input.eventId,
    p_session: input.session,
  });
  if (error) throw new Error(`Failed to finalize paid shop order: ${error.message}`);
  return data;
}

export async function releaseShopOrderReservationsForCheckoutSession(input: {
  eventId: string;
  stripeCheckoutSessionId: string;
}) {
  const supabase = await createAdminClient();
  const { error } = await supabase.rpc("shop_release_order_for_checkout_session", {
    p_event_id: input.eventId,
    p_stripe_checkout_session_id: input.stripeCheckoutSessionId,
  });
  if (error) throw new Error(`Failed to release shop order reservations: ${error.message}`);
}

export async function recordShopRefundEvent(input: {
  eventId: string;
  payload: Record<string, unknown>;
}) {
  const supabase = await createAdminClient();
  const { error } = await supabase.rpc("shop_record_refund_event", {
    p_event_id: input.eventId,
    p_payload: input.payload,
  });
  if (error) throw new Error(`Failed to record shop refund event: ${error.message}`);
}
```

Use `createAdminClient()` because webhook processing is trusted server context and must not depend on a browser session.

- [ ] **Step 3: Write webhook route tests**

Test that:

- missing Stripe signature returns 400
- invalid signature returns 400
- unsupported event returns `{ received: true }`
- `checkout.session.completed` calls order finalization
- `checkout.session.expired` releases reservations
- local timestamp cleanup does not release reservations for orders with `stripe_checkout_session_id`
- `charge.refunded` and `charge.refund.updated` record refund status
- async Checkout events are ignored with a visible log because launch Checkout is restricted to cards

- [ ] **Step 4: Implement webhook route**

Create `src/app/api/shop/stripe/webhook/route.ts`:

```ts
import { NextResponse } from "next/server";
import Stripe from "stripe";
import {
  finalizeShopOrderPaidFromCheckoutSession,
  recordShopRefundEvent,
  releaseShopOrderReservationsForCheckoutSession,
} from "@/lib/data/shop-orders";
import { getStripeClient, getStripeWebhookSecret } from "@/lib/shop/stripe";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing Stripe signature" }, { status: 400 });

  const body = await request.text();
  let event: Stripe.Event;
  try {
    event = getStripeClient().webhooks.constructEvent(body, signature, getStripeWebhookSecret());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid Stripe webhook";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    await finalizeShopOrderPaidFromCheckoutSession({ eventId: event.id, session: session as unknown as Record<string, unknown> });
  }

  if (event.type === "checkout.session.expired") {
    const session = event.data.object as Stripe.Checkout.Session;
    await releaseShopOrderReservationsForCheckoutSession({ eventId: event.id, stripeCheckoutSessionId: session.id });
  }

  if (event.type === "charge.refunded" || event.type === "charge.refund.updated") {
    await recordShopRefundEvent({ eventId: event.id, payload: event.data.object as unknown as Record<string, unknown> });
  }

  return NextResponse.json({ received: true });
}
```

- [ ] **Step 5: Run webhook tests**

```bash
npm run test:unit -- src/app/api/shop/stripe/webhook/route.test.ts src/lib/data/shop-orders.test.ts
```

Expected: tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/shop/stripe/webhook/route.ts src/app/api/shop/stripe/webhook/route.test.ts src/lib/data/shop-orders.ts src/lib/data/shop-orders.test.ts
git commit -m "feat: finalize shop orders from stripe webhooks"
```

### Task 5.3: Add Checkout Return Pages

**Files:**
- Create: `src/app/(marketing)/shop/success/page.tsx`
- Create: `src/app/(marketing)/shop/canceled/page.tsx`

- [ ] **Step 1: Add success page**

Create `src/app/(marketing)/shop/success/page.tsx`:

```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function ShopSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const { order } = await searchParams;

  return (
    <div className="mx-auto grid min-h-[50vh] w-full max-w-2xl place-items-center px-5 py-16">
      <div className="space-y-5 text-center">
        <h1 className="text-3xl font-medium text-foreground">Order received</h1>
        <p className="text-muted-foreground">
          Payment confirmation can take a moment. Your order page and email will update after Stripe confirms payment.
        </p>
        {order ? <p className="text-sm text-muted-foreground">Order reference: {order}</p> : null}
        <Button asChild>
          <Link href="/profile/orders">View orders</Link>
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add canceled page**

Create `src/app/(marketing)/shop/canceled/page.tsx`:

```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ShopCanceledPage() {
  return (
    <div className="mx-auto grid min-h-[50vh] w-full max-w-2xl place-items-center px-5 py-16">
      <div className="space-y-5 text-center">
        <h1 className="text-3xl font-medium text-foreground">Checkout canceled</h1>
        <p className="text-muted-foreground">
          Your payment was not completed. Reserved stock is released by the Stripe expiration webhook or the cleanup job.
        </p>
        <Button asChild variant="outline">
          <Link href="/shop/cart">Return to cart</Link>
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run lint**

```bash
npm run lint -- 'src/app/(marketing)/shop/success/page.tsx' 'src/app/(marketing)/shop/canceled/page.tsx'
```

Expected: lint reports no errors.

- [ ] **Step 4: Commit**

```bash
git add 'src/app/(marketing)/shop/success/page.tsx' 'src/app/(marketing)/shop/canceled/page.tsx'
git commit -m "feat: add shop checkout return pages"
```

### Task 5.4: Add Stripe Session Reconciliation Path

**Files:**
- Modify: `src/lib/data/shop-orders.ts`
- Modify: `src/lib/data/shop-orders.test.ts`
- Modify: `src/lib/shop/checkout.ts`
- Modify: `src/lib/shop/checkout.test.ts`

- [ ] **Step 1: Add reconciliation tests**

Test that:

- pending orders with attached Stripe sessions are not released from local timestamps alone
- a retrieved Stripe Session with `status = "expired"` calls `shop_release_order_for_checkout_session`
- a retrieved Stripe Session with `payment_status = "paid"` calls `shop_finalize_paid_order_from_checkout`
- open sessions are left untouched

- [ ] **Step 2: Implement reconciliation helper**

Add a helper that can be called manually by admins or a future cron:

```ts
export async function reconcilePendingShopCheckoutSession(input: {
  stripeCheckoutSessionId: string;
}) {
  const stripe = getStripeClient();
  const session = await stripe.checkout.sessions.retrieve(input.stripeCheckoutSessionId);
  if (session.payment_status === "paid") {
    return finalizeShopOrderPaidFromCheckoutSession({
      eventId: `reconcile:${session.id}:paid`,
      session: session as unknown as Record<string, unknown>,
    });
  }
  if (session.status === "expired") {
    return releaseShopOrderReservationsForCheckoutSession({
      eventId: `reconcile:${session.id}:expired`,
      stripeCheckoutSessionId: session.id,
    });
  }
  return { reconciled: false, status: session.status, paymentStatus: session.payment_status };
}
```

Use deterministic synthetic event ids so reconciliation is idempotent and compatible with `shop_stripe_events`.

- [ ] **Step 3: Run tests**

```bash
npm run test:unit -- src/lib/data/shop-orders.test.ts src/lib/shop/checkout.test.ts
```

Expected: reconciliation tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/data/shop-orders.ts src/lib/data/shop-orders.test.ts src/lib/shop/checkout.ts src/lib/shop/checkout.test.ts
git commit -m "feat: add shop checkout reconciliation"
```

---

## Phase 6: Transactional Emails

**Goal:** Send customer confirmation and internal paid-order alerts after payment confirmation, with visible order events for failures.

**Gate:** Email rendering/sending tests pass; webhook finalization records email success/failure events.

### Task 6.1: Add Shop Email Helpers

**Files:**
- Create: `src/lib/shop/order-emails.ts`
- Create: `src/lib/shop/order-emails.test.ts`
- Modify: `src/lib/data/shop-orders.ts`
- Modify: `src/lib/data/shop-orders.test.ts`

- [ ] **Step 1: Write order email tests**

Cover:

- customer email subject includes order number
- internal alert goes to `SHOP_INTERNAL_ALERT_EMAIL`
- physical order alert includes shipping address
- digital/service order alert mentions manual delivery/follow-up
- provider failure returns an error result without hiding it
- repeated webhook/finalization attempts do not send duplicate emails because `shop_order_notifications` has one row per order/kind

- [ ] **Step 2: Implement email helper**

Create `src/lib/shop/order-emails.ts`:

```ts
import { getEmailFromEmail, getEmailFromName, getEmailReplyToEmail } from "@/lib/email/settings";
import type { EmailProvider } from "@/lib/email/provider/types";

export async function sendShopOrderConfirmation(input: {
  provider: EmailProvider;
  orderId: string;
  orderNumber: string;
  to: string;
  totalFormatted: string;
}) {
  return input.provider.sendEmail({
    recipientId: `${input.orderId}:customer_confirmation`,
    sendId: `${input.orderId}:customer_confirmation`,
    contactId: null,
    to: input.to,
    fromEmail: getEmailFromEmail(),
    fromName: getEmailFromName(),
    replyTo: getEmailReplyToEmail(),
    subject: `Order ${input.orderNumber} confirmed`,
    html: `<p>Thanks for your order. Total: ${input.totalFormatted}</p>`,
    text: `Thanks for your order. Total: ${input.totalFormatted}`,
    metadata: { kind: "shop_order_confirmation", orderId: input.orderId },
  });
}
```

Add `sendShopInternalOrderAlert` with the same provider interface and deterministic IDs:

```ts
recipientId: `${orderId}:internal_alert`;
sendId: `${orderId}:internal_alert`;
```

- [ ] **Step 3: Wire emails into finalization**

After the database finalization RPC returns pending notification rows, claim each notification before sending:

```ts
const provider = getEmailProvider();
const notification = await claimShopOrderNotification({ orderId, kind: "customer_confirmation" });
if (notification) {
  await sendShopOrderConfirmation(...);
  await markShopOrderNotificationSent(notification.id);
}
```

Implement `claimShopOrderNotification`, `markShopOrderNotificationSent`, and `markShopOrderNotificationFailed` in `src/lib/data/shop-orders.ts` using the service-role client. The claim helper must update one `pending` row to `sending` and return null when the notification is already `sending` or `sent`.

Wrap each send in try/catch and append `shop_order_events` with `email_sent` or `email_failed`. Use `customer_visible = false` for email/internal operational events.

- [ ] **Step 4: Run tests**

```bash
npm run test:unit -- src/lib/shop/order-emails.test.ts src/lib/data/shop-orders.test.ts
```

Expected: email tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shop/order-emails.ts src/lib/shop/order-emails.test.ts src/lib/data/shop-orders.ts src/lib/data/shop-orders.test.ts
git commit -m "feat: add shop order emails"
```

---

## Phase 7: Admin Orders And Fulfillment

**Goal:** Let admins search orders, view details, update fulfillment/tracking, add internal notes, see low-stock products, and export CSV.

**Gate:** Admin order action tests pass; admin dashboard can update fulfillment state and tracking for a paid order.

### Task 7.1: Add Admin Order Data And Actions

**Files:**
- Modify: `src/lib/data/shop-orders.ts`
- Modify: `src/lib/data/shop-orders.test.ts`
- Modify: `src/app/(dashboard)/admin/shop/actions.ts`
- Modify: `src/app/(dashboard)/admin/shop/actions.test.ts`

- [ ] **Step 1: Add tests for admin order updates**

Test:

- `listAdminShopOrders` orders by newest first
- `updateShopOrderFulfillment` requires admin
- tracking updates append `tracking_updated`
- internal notes append `note`

- [ ] **Step 2: Implement data helpers**

Add:

```ts
import { escapeSearchTerm } from "@/lib/validation-helpers";

export async function listAdminShopOrders(filters: {
  status?: ShopOrderStatus;
  query?: string;
}) {
  await requireAdmin();
  const supabase = await createClient();
  let query = supabase
    .from("shop_orders")
    .select("*, items:shop_order_items(*), events:shop_order_events(*)")
    .order("created_at", { ascending: false });

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.query) {
    const term = escapeSearchTerm(filters.query.trim());
    query = query.or(
      `order_number.ilike.%${term}%,customer_email.ilike.%${term}%,customer_name.ilike.%${term}%`,
    );
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load shop orders: ${error.message}`);
  return data ?? [];
}

export async function updateShopOrderFulfillment(input: {
  orderId: string;
  fulfillmentStatus: ShopFulfillmentStatus;
  trackingCarrier?: string;
  trackingNumber?: string;
  trackingUrl?: string;
}) {
  const admin = await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("shop_orders")
    .update({
      fulfillment_status: input.fulfillmentStatus,
      tracking_carrier: input.trackingCarrier ?? null,
      tracking_number: input.trackingNumber ?? null,
      tracking_url: input.trackingUrl ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.orderId);

  if (error) throw new Error(`Failed to update fulfillment: ${error.message}`);

  const { error: eventError } = await supabase.from("shop_order_events").insert({
    order_id: input.orderId,
    type: input.trackingNumber ? "tracking_updated" : "fulfillment_updated",
    actor_id: admin.id,
    message: "Fulfillment updated from admin dashboard.",
    payload: input,
    customer_visible: true,
  });
  if (eventError) throw new Error(`Failed to record fulfillment event: ${eventError.message}`);
}
```

- [ ] **Step 3: Add server actions**

Add `updateShopOrderFulfillmentAction`, `addShopOrderNoteAction`, and `exportShopOrdersCsvAction` to admin shop actions. Validate UUIDs and status enums with Zod. Internal note events must set `customer_visible = false`.

- [ ] **Step 4: Run tests**

```bash
npm run test:unit -- src/lib/data/shop-orders.test.ts 'src/app/(dashboard)/admin/shop/actions.test.ts'
```

Expected: tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/shop-orders.ts src/lib/data/shop-orders.test.ts 'src/app/(dashboard)/admin/shop/actions.ts' 'src/app/(dashboard)/admin/shop/actions.test.ts'
git commit -m "feat: add shop order admin actions"
```

### Task 7.2: Build Admin Orders UI

**Files:**
- Modify: `src/app/(dashboard)/admin/shop/shop-admin.tsx`
- Create: `src/app/(dashboard)/admin/shop/orders-panel.tsx`
- Create: `src/app/(dashboard)/admin/shop/order-detail.tsx`
- Create: `src/app/(dashboard)/admin/shop/low-stock-panel.tsx`

- [ ] **Step 1: Add Orders and Low Stock tabs**

Extend `ShopAdminTab`:

```ts
type ShopAdminTab = "products" | "orders" | "shipping" | "low-stock";
```

Render `OrdersPanel` and `LowStockPanel`.

- [ ] **Step 2: Build order list/detail components**

`OrdersPanel` must show:

- order number
- customer email/name
- status
- fulfillment status
- total
- created date
- view/detail action

`OrderDetail` must show:

- items
- Stripe refs
- billing/shipping addresses
- customer notes
- order events
- fulfillment/tracking form
- internal note form

- [ ] **Step 3: Build low stock panel**

Show active variants where `stock_quantity <= low_stock_threshold`, excluding variants with `track_inventory = false`.

- [ ] **Step 4: Run lint**

```bash
npm run lint -- 'src/app/(dashboard)/admin/shop'
```

Expected: lint reports no errors.

- [ ] **Step 5: Commit**

```bash
git add 'src/app/(dashboard)/admin/shop'
git commit -m "feat: add shop order admin UI"
```

---

## Phase 8: Member Order History

**Goal:** Let members view their own order list and order details from the profile area.

**Gate:** Member order data tests pass; `/profile/orders` and `/profile/orders/[id]` render only the signed-in member's orders.

### Task 8.1: Add Member Order Pages

**Files:**
- Modify: `src/app/(dashboard)/profile/profile-sidebar.tsx`
- Create: `src/app/(dashboard)/profile/orders/page.tsx`
- Create: `src/app/(dashboard)/profile/orders/[id]/page.tsx`
- Create: `src/components/shop/MemberOrderList.tsx`
- Create: `src/components/shop/MemberOrderDetail.tsx`
- Modify: `src/lib/data/shop-orders.ts`
- Modify: `src/lib/data/shop-orders.test.ts`

- [ ] **Step 1: Add member order fetcher tests**

Test:

- `getMemberShopOrders` filters by current profile ID
- `getMemberShopOrderById` returns null when order is not owned by current profile
- fetcher throws loud error on Supabase error

- [ ] **Step 2: Implement member fetchers**

Add:

```ts
export const getMemberShopOrders = cache(async function getMemberShopOrders() {
  const profile = await getProfile();
  if (!profile) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shop_orders")
    .select("*, items:shop_order_items(*)")
    .eq("profile_id", profile.id)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to load shop orders: ${error.message}`);
  return data ?? [];
});

export const getMemberShopOrderById = cache(async function getMemberShopOrderById(orderId: string) {
  const profile = await getProfile();
  if (!profile) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shop_orders")
    .select("*, items:shop_order_items(*)")
    .eq("id", orderId)
    .eq("profile_id", profile.id)
    .maybeSingle();

  if (error) throw new Error(`Failed to load shop order: ${error.message}`);
  if (!data) return null;

  const { data: events, error: eventsError } = await supabase
    .from("shop_order_events")
    .select("*")
    .eq("order_id", orderId)
    .eq("customer_visible", true)
    .order("created_at", { ascending: true });

  if (eventsError) throw new Error(`Failed to load shop order timeline: ${eventsError.message}`);
  return { ...data, events: events ?? [] };
});
```

- [ ] **Step 3: Add profile sidebar link**

Add icon key `orders` and link:

```ts
{ href: "/profile/orders", label: "Orders", icon: "orders" }
```

- [ ] **Step 4: Add order list/detail pages**

Create pages that call member fetchers and render:

- order number/date/status
- subtotal/shipping/tax/total
- fulfillment status
- items
- tracking if present
- manual delivery/follow-up note for digital/service

- [ ] **Step 5: Run tests and lint**

```bash
npm run test:unit -- src/lib/data/shop-orders.test.ts
npm run lint -- 'src/app/(dashboard)/profile/orders' src/components/shop/MemberOrderList.tsx src/components/shop/MemberOrderDetail.tsx src/app/(dashboard)/profile/profile-sidebar.tsx
```

Expected: tests pass and lint reports no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/data/shop-orders.ts src/lib/data/shop-orders.test.ts 'src/app/(dashboard)/profile/profile-sidebar.tsx' 'src/app/(dashboard)/profile/orders' src/components/shop/MemberOrderList.tsx src/components/shop/MemberOrderDetail.tsx
git commit -m "feat: add member shop order history"
```

---

## Phase 9: End-To-End Coverage And Launch Hardening

**Goal:** Verify the full member checkout path, admin operations, failure states, and production build.

**Gate:** unit tests, lint, build, and targeted Playwright tests pass.

### Task 9.1: Add Playwright Coverage

**Files:**
- Create: `e2e/shop.spec.ts`

- [ ] **Step 1: Add E2E scenarios**

Create scenarios for:

```ts
import { expect, test } from "@playwright/test";

test.describe("shop", () => {
  test("public visitor can see public products but cannot checkout", async ({ page }) => {
    await page.goto("/shop");
    await expect(page.getByRole("heading", { name: "Shop" })).toBeVisible();
  });

  test("admin shop tab is available to admins", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByRole("button", { name: "Shop" })).toBeVisible();
  });
});
```

Use existing auth helpers if present. If there are no auth helpers, create seeded users or mark the deeper checkout test as a follow-up in the same file with a clear skipped reason:

```ts
test.skip("member can complete Stripe test checkout", async () => {
  // Requires Stripe CLI/webhook test harness and authenticated member fixture.
});
```

- [ ] **Step 2: Run targeted E2E**

Start dev server:

```bash
npm run dev -- --port 3001
```

Then run:

```bash
npm run test:e2e -- e2e/shop.spec.ts
```

Expected: implemented E2E tests pass; skipped tests include explicit reason.

- [ ] **Step 3: Commit**

```bash
git add e2e/shop.spec.ts
git commit -m "test: add shop e2e coverage"
```

### Task 9.2: Full Verification And Cleanup

**Files:**
- Modify only files required by failures found in this task.

- [ ] **Step 1: Run lint**

```bash
npm run lint
```

Expected: exit 0.

- [ ] **Step 2: Run unit tests**

```bash
npm run test:unit
```

Expected: all unit tests pass.

- [ ] **Step 3: Run build**

```bash
npm run build
```

Expected: production build exits 0.

- [ ] **Step 4: Run targeted E2E**

```bash
npm run test:e2e -- e2e/shop.spec.ts
```

Expected: shop E2E tests pass.

- [ ] **Step 5: Inspect git status**

```bash
git status --short --branch
```

Expected: only intentional files are changed.

- [ ] **Step 6: Commit final fixes**

If any fixes were needed:

```bash
git add <changed files>
git commit -m "chore: harden shop implementation"
```

If no fixes were needed, do not create an empty commit.

### Task 9.3: Document Launch Operations

**Files:**
- Modify: `docs/admin-email-operations.md` or the repo's existing environment/operations document

- [ ] **Step 1: Add Stripe and shop environment notes**

Document:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `SHOP_INTERNAL_ALERT_EMAIL`
- Stripe Dashboard webhook endpoint path: `/api/shop/stripe/webhook`
- Launch payment method policy: card-only Checkout with wallet support where Stripe exposes wallets through cards
- EUR-only launch charging
- 30-minute reservation TTL aligned with Stripe Checkout expiration

- [ ] **Step 2: Add manual fulfillment notes**

Document that physical labels, digital delivery, service follow-up, and refunds are operated manually at launch, while webhook events still update order status/refund visibility.

- [ ] **Step 3: Commit docs**

```bash
git add docs/admin-email-operations.md
git commit -m "docs: add shop launch operations"
```

---

## Rollback Notes

- The migration creates new shop tables and a new storage bucket only; it should not mutate existing application tables.
- If Phase 1 needs rollback before production data exists, create a down migration or use Supabase migration repair in local development only.
- After production orders exist, never drop shop tables. Instead add forward migrations that archive or disable products, preserve orders, and keep audit trails.
- Stripe webhook handlers must be idempotent before any live test payments.

## Self-Review Checklist

- Spec coverage: products, variants, media, rich content, member checkout, EUR-only, Stripe Checkout/Tax, 30-minute Checkout-aligned reservations, flat shipping, manual fulfillment, Brevo emails, admin operations, member order history, RLS, and tests are covered.
- Type consistency: product/order/status names match the design spec and planned migration enums.
- Simplicity: custom cart and phased admin avoid unnecessary dependencies while preserving operational needs.
- Known implementation risk: SQL checkout/finalization RPCs, shipping-country configuration, and Stripe webhook idempotency are the highest-risk areas; they are deliberately isolated and tested before UI polish.
