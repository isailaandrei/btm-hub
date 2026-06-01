# Shop Operations

The shop uses Supabase for catalog, inventory reservations, orders, and order
events. Stripe Checkout handles payment collection, tax calculation, and payment
webhooks.

## Required Environment

- `STRIPE_SECRET_KEY` for creating Checkout sessions.
- `STRIPE_WEBHOOK_SECRET` for `/api/shop/stripe/webhook`.
- `NEXT_PUBLIC_SITE_URL` for Checkout success and cancel URLs.
- `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_LOCAL_SERVICE_ROLE_KEY` for webhook
  reconciliation and notification processing.
- `EMAIL_PROVIDER`, plus the provider-specific variables documented in
  `docs/admin-email-operations.md`, for order notifications.
- `EMAIL_WORKER_SECRET` for manually triggering
  `/api/shop/orders/process-notifications`.

For local Stripe testing, use test-mode keys and set:

```bash
NEXT_PUBLIC_SITE_URL=http://localhost:3000
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

Forward Stripe CLI events to:

```bash
stripe listen --forward-to http://localhost:3000/api/shop/stripe/webhook
```

## Checkout Flow

1. Product pages add selected variants to the browser cart.
2. `/shop/cart` posts cart lines to `startShopCheckoutAction`.
3. The server action calls `shop_begin_checkout`, which validates membership,
   stock, product visibility, and creates inventory reservations.
4. Stripe Checkout is created with the selected shipping zone/rate when the cart
   requires shipping.
5. `shop_attach_checkout_session` stores the Stripe session on the pending order.
6. `checkout.session.completed` finalizes the order, converts reservations into
   stock adjustments, and queues customer/internal order emails.
7. `checkout.session.expired` releases reservations and cancels the pending order.

The launch Checkout configuration is card-only (`payment_method_types: ["card"]`)
so fulfillment depends on immediate payment confirmation. If delayed/asynchronous
payment methods are enabled later, add explicit handling for
`checkout.session.async_payment_succeeded` and
`checkout.session.async_payment_failed` before enabling them in Stripe.

When `NEXT_PUBLIC_SHOW_MOCK_SHOP_PRODUCT=1`, the mock product can also create a
real Stripe Checkout Session for previewing the hosted payment page, but only
with a `sk_test_...` Stripe key and never in `VERCEL_ENV=production`. That flow
is marked with `mockCheckoutPreview=1` metadata and is acknowledged by the
webhook without creating or finalizing a database order.

## Admin Flow

The `/admin` Shop tab contains:

- Products: catalog fields, variants, inventory, media uploads, and content blocks.
- Shipping: default editable shipping zones and rates.
- Orders: order status, items, and fulfillment/tracking updates.
