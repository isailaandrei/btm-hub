# BTM Store Design

Date: 2026-05-08  
Branch/worktree: implementation planning continues on `feature/store-implementation-plan` at `/Users/andrei/Dev/btm-hub/.worktrees/store-implementation-plan`; original design draft was created on `feature/store-shop`.

## Summary

Build a custom store inside BTM Hub for a Portugal-based business selling mostly to Europe, with worldwide sales supported. The catalog is small and hand-managed, roughly 10-20 live products at a time, with varied product types: apparel, wetsuits, cameras, photography tables, digital products, and service/booking products.

The store should avoid high-percentage ecommerce platforms. It will use the existing Next.js, Supabase, shadcn/ui, and Brevo stack, with Stripe Checkout and Stripe Tax for payment and tax handling.

The implementation should happen only in a store feature worktree, currently `feature/store-implementation-plan`, never directly on `main`.

## Goals

- Sell physical, digital, and service products from the BTM website.
- Keep the system custom, understandable, and low-vendor-cost.
- Use Stripe Checkout rather than collecting card details directly.
- Use Stripe Tax from day one.
- Charge in EUR only at launch.
- Support hybrid product visibility: public browsing for selected products, member-only visibility for others.
- Require community membership for checkout at launch.
- Manually manage inventory, shipping rates, fulfillment, and digital/service delivery.
- Provide an operational admin dashboard, phased sensibly.
- Provide member order history and order detail pages.

## Non-Goals

- No Shopify, Medusa, Vendure, Saleor, WooCommerce, or Vercel Commerce integration for launch.
- No custom card form or direct card handling.
- No true multi-currency pricing for launch.
- No live carrier shipping rates for launch.
- No automated digital file delivery for launch.
- No booking calendar integration for launch.
- No external product image URLs for launch.

## External Services

### Stripe

Use Stripe Checkout for hosted checkout and Stripe Tax for tax calculation.

Launch configuration:

- Currency: `eur`
- Checkout mode: `payment`
- Automatic tax: enabled
- Address collection: configured according to product mix and Stripe Tax requirements
- Shipping address collection: required when the cart contains physical items
- Metadata: include internal order/reservation identifiers
- Webhook: validate Stripe signatures and process payment lifecycle events

Stripe handles card payment UI, Apple Pay/Google Pay where available, payment method validation, tax calculation, and redirect handling. The server still owns prices, stock validation, product eligibility, order records, and fulfillment state.

### Brevo

Use Brevo for:

- customer order confirmation email
- internal paid order alert email
- later fulfillment/tracking emails

Email failure must be visible in order events/logs. Order creation and payment confirmation must not silently fail if email delivery fails.

### Supabase

Use Supabase Postgres for all commerce data and Supabase Storage for product media.

No Sanity dependency for store product content at launch.

## Product Scope

Products have one of three types:

- `physical`: requires shipping and stock fulfillment.
- `digital`: no shipping; launch delivery is manual.
- `service`: no shipping; launch fulfillment is manual follow-up.

Service products collect only optional customer notes before checkout, in addition to whatever Stripe collects for billing, tax, and payment. Do not ask for extra service addresses by default.

Digital products are manual delivery at launch. Confirmation email should tell the customer BTM will send access/files manually.

## Visibility and Access

Product visibility and purchase access are separate.

Product visibility:

- `public`: visible to everyone.
- `members`: visible only to logged-in members/admins.
- `hidden`: not listed; admin-only except possible future direct internal uses.

Purchase access:

- Launch default: `members`.
- Members and admins can buy.
- Public visitors may browse selected public products, but checkout requires login/community membership.

The current app already has `profiles.role` as `member | admin`; use that model rather than introducing a separate membership table for launch.

## Currency

Launch is EUR-only.

- Store prices as integer EUR cents.
- Checkout sessions use `eur`.
- Orders snapshot all monetary totals in EUR cents.
- No per-currency product pricing UI.
- No separate settlement currency handling.

Localized currency estimates can be added later as a display-only enhancement, without changing the actual charge currency.

## Shipping

Use manual flat-rate shipping zones for launch.

Initial zones:

- Portugal
- EU
- UK
- USA/Canada
- Rest of World

Each zone has configurable EUR flat rates. Admin can activate/deactivate zones and rates.

Physical products require shipping address collection in Stripe Checkout. Fulfillment labels are bought manually outside the app at launch. Admin can add carrier, tracking number, and tracking URL to the order.

## Inventory and Reservations

Inventory is tracked at the variant level.

Use Checkout-aligned stock reservations when checkout starts. The launch window is 30 minutes, because Stripe Checkout's hosted `expires_at` setting cannot be shorter than 30 minutes. The original 10-minute preference is deferred unless we later replace hosted Checkout with a custom payment flow.

1. Member submits cart for checkout.
2. Server validates membership, product access, product status, variant status, current price, and available stock.
3. Server creates active reservations that expire in 30 minutes.
4. Server creates a pending order/draft checkout record tied to the reservations.
5. Server creates a Stripe Checkout Session.
6. Payment success webhook converts reservations to sold stock and records inventory adjustments.
7. Checkout expiration/failure releases reservations.
8. A cleanup path expires old active reservations.

The client never controls stock, prices, totals, or order state.

## Cart

Use a small custom cart for launch rather than taking a cart dependency.

Rationale:

- Cart needs are modest.
- The current `use-shopping-cart` stable package still carries older React-era dependencies, while its React 19-compatible release is an RC.
- A custom cart lets us store only variant IDs and quantities locally, then rebuild all prices and product details server-side at checkout.

Cart behavior:

- Client cart stores variant IDs and quantities in localStorage.
- Product and price display comes from server-rendered product data.
- Checkout server action receives cart lines, then reloads products/variants from Supabase.
- If any item is unavailable, price-changed, out of stock, or no longer purchasable, fail loudly with a visible message.

Use `useSyncExternalStore` or an equivalent safe browser-store pattern for cart state to avoid server/client hydration issues.

## Storefront UI

Routes:

- `/shop`: product listing with public/member-aware filtering.
- `/shop/[slug]`: product detail page.
- `/shop/cart`: cart review.
- `/shop/checkout`: pre-checkout validation/details step when needed.
- `/shop/success`: post-checkout success page.
- `/shop/canceled`: canceled checkout page.

Product detail page direction:

- Use Shadcnblocks Product Detail 7 as visual inspiration.
- Implement our own component with local shadcn/ui primitives.
- Do not depend on proprietary block code unless licensed code is explicitly provided.

Expected PDP components:

- image carousel/gallery with thumbnails
- badges for product type/status/member access
- variant selector
- quantity selector
- stock/low-stock display
- add-to-cart button
- tax/shipping note
- optional customer notes entry for service products before checkout
- accordions for details, specs, care/use instructions, delivery/returns
- rich content block renderer below the purchase section

Use existing repo conventions: Tailwind CSS 4 utilities, shadcn/radix-maia-style primitives, server components by default, small client components only for interactive controls.

## Product Content Admin

Supabase/admin dashboard is the product source of truth.

Admin product fields:

- title
- slug
- status
- type
- visibility
- purchase access
- short description
- variants
- price in EUR cents
- stock quantity and thresholds
- product media
- rich content blocks
- shipping/digital/service flags
- customer notes label/optional flag for service products

Rich content blocks are stored as JSONB and edited from the admin dashboard.

Initial block types:

- rich text
- image/media reference
- specs table
- bullet list
- care/use instructions
- digital delivery notes
- service terms/follow-up notes

Keep the block schema intentionally small. Add more block types only when a real product needs them.

## Product Media

Use Supabase Storage only.

- Bucket: product media bucket.
- Admin uploads images from the dashboard.
- Validate MIME type and file size.
- Store ordered gallery records in Postgres.
- Product listing uses the primary image.
- Product detail uses the ordered gallery.
- No external image URLs for launch.

The bucket can be public for launch if images are product marketing assets. If private storage is required later, use signed URLs and caching carefully.

## Orders and Fulfillment

Order states:

- `pending`
- `paid`
- `canceled`
- `refunded`
- `partially_refunded`

Fulfillment states:

- `unfulfilled`
- `in_progress`
- `fulfilled`
- `partially_fulfilled`
- `canceled`

Order item fulfillment types:

- `physical`
- `manual_digital`
- `manual_service`

Admin order detail supports:

- order overview
- member/customer profile
- line items
- billing/shipping data from Stripe
- customer notes
- payment/tax/shipping totals
- fulfillment status updates
- tracking data for physical orders
- manual delivery/follow-up status for digital/service orders
- internal notes
- order event log

Refunds are visible in admin, but full refund initiation can be deferred to the Stripe Dashboard for the first version if needed. The app should still record refund webhook events and reflect status.

## Member Order History

Members get order list and detail pages.

Routes should live under the profile/dashboard area, for example:

- `/profile/orders`
- `/profile/orders/[id]`

Member order detail includes:

- order number/date/status
- items purchased
- subtotal, shipping, tax, total
- fulfillment status
- tracking details if available
- manual digital/service delivery notes
- submitted customer notes

Members can read only their own orders. Admins use the admin order dashboard for all orders.

## Admin Dashboard

Target is operational admin, delivered in phases.

Phase 1 must support:

- product CRUD
- variants
- stock quantity edits
- media upload
- rich content editing
- shipping zones/rates
- order list
- order detail
- fulfillment/tracking updates
- internal paid-order email alerts

Phase 2 adds:

- media reordering polish
- product duplication
- inventory adjustment history UI
- order internal notes
- refund status visibility from webhooks
- low-stock view

Phase 3 adds:

- stronger search/filtering
- bulk status updates
- CSV export
- admin reporting views

The database should support all phases early where cheap, but UI can be phased so the first implementation is testable and shippable.

## Data Model

Primary tables:

- `shop_products`
- `shop_product_variants`
- `shop_product_media`
- `shop_inventory_adjustments`
- `shop_inventory_reservations`
- `shop_orders`
- `shop_order_items`
- `shop_order_events`
- `shop_shipping_zones`
- `shop_shipping_rates`

Recommended product fields:

- `id`
- `title`
- `slug`
- `type`
- `status`
- `visibility`
- `purchase_access`
- `short_description`
- `content_blocks`
- `requires_shipping`
- `requires_customer_notes`
- `customer_notes_label`
- `sort_order`
- `created_at`
- `updated_at`

Recommended variant fields:

- `id`
- `product_id`
- `title`
- `sku`
- `price_cents`
- `currency`
- `track_inventory`
- `stock_quantity`
- `low_stock_threshold`
- `active`
- `sort_order`
- `created_at`
- `updated_at`

Recommended order fields:

- `id`
- `order_number`
- `profile_id`
- `status`
- `fulfillment_status`
- `currency`
- `subtotal_cents`
- `shipping_cents`
- `tax_cents`
- `total_cents`
- `stripe_checkout_session_id`
- `stripe_payment_intent_id`
- `stripe_customer_id`
- `customer_email`
- `customer_name`
- `billing_address`
- `shipping_address`
- `shipping_zone_id`
- `customer_notes`
- `created_at`
- `updated_at`

Order items must snapshot product and variant titles, SKU, quantity, unit price, tax amounts, and fulfillment type so old orders remain accurate after product edits.

## Security and RLS

Use RLS from the start.

Policies:

- Public users can read active public products and media metadata needed for browsing.
- Members/admins can read active public and member products.
- Admins can manage all shop tables.
- Members can read their own orders/order items/order events.
- Members cannot directly insert paid orders or inventory changes from the browser.
- Webhooks and trusted server actions use server-only credentials where necessary.

Server-side guards:

- checkout creation must verify profile exists and role is `member` or `admin`.
- admin mutations use `requireAdmin()`.
- webhooks verify Stripe signature before touching order state.
- checkout URLs must validate redirect paths and never trust arbitrary client redirects.

## Error Handling

Follow the project rule: fail loud, never fake.

Examples:

- If Stripe checkout creation fails, show a visible checkout error and release reservations if needed.
- If price/stock changed, show a specific cart error rather than silently adjusting totals.
- If Brevo email fails, record an order event and show admin-visible warning; do not pretend email sent.
- If webhook processing fails, return non-2xx so Stripe retries, and log the failure.
- If product media fails to load in admin, show an explicit degraded media state.

## Testing

Unit and integration tests:

- product visibility and access rules
- cart validation against current DB product/variant state
- checkout reservation creation and expiry behavior
- stock availability calculations
- Stripe Checkout Session payload construction
- Stripe webhook signature/event handling
- conversion of reservations to sold stock
- release of expired/failed reservations
- order total snapshot behavior
- Brevo email payload generation
- RLS-sensitive data fetchers where practical with existing mocks

E2E tests:

- member can browse eligible product, add to cart, start checkout in test mode
- public user cannot checkout and is prompted to log in
- admin can create/edit product and see it in shop
- admin can update fulfillment/tracking
- member can view order history/detail

Build verification:

- `npm run lint`
- `npm run test:unit`
- `npm run build`
- targeted Playwright tests once checkout/admin flows exist

## Implementation Phasing

### Phase 1: Commerce Foundation

- migrations and TypeScript types
- product/variant/media/order/reservation/shipping tables
- RLS policies
- data fetchers
- product listing/detail read paths
- basic admin product CRUD

### Phase 2: Cart and Checkout

- custom cart
- checkout validation
- 30-minute Checkout-aligned reservations
- Stripe Checkout Session creation with Stripe Tax
- success/canceled pages
- Stripe webhook
- paid order creation/finalization

### Phase 3: Fulfillment and Emails

- Brevo customer/internal emails
- admin order list/detail
- fulfillment/tracking updates
- manual digital/service delivery statuses
- member order list/detail

### Phase 4: Operational Admin

- rich content block editor polish
- media reorder
- product duplication
- inventory adjustment history UI
- low-stock views
- search/filtering
- bulk status updates
- CSV export

## Deferred Enhancements

- true multi-currency pricing
- display-only localized currency estimates
- live carrier shipping rates
- automated label purchase
- automated digital file delivery
- booking/calendar integrations
- public checkout
- promotions/discount codes
- product reviews
- subscriptions/memberships billing

## Documentation Checked During Design

- Next.js App Router and Server Actions documentation
- Supabase RLS documentation
- Stripe Checkout documentation
- Stripe Portugal pricing
- Stripe Tax documentation
- Stripe currency and settlement documentation
- Stripe address/custom field documentation
- Shadcnblocks Product Detail 7 reference
