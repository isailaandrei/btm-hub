import Stripe from "stripe";
import { getPublicSiteUrl } from "@/lib/email/settings";
import type { ShopShippingRate, ShopShippingZone } from "@/types/database";
import type { ShopCheckoutOrder } from "./types";

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
  return new Stripe(key);
}

export function assertMockStripeCheckoutPreviewAllowed() {
  if (process.env.VERCEL_ENV === "production") {
    throw new Error("Mock Stripe checkout preview is disabled in production.");
  }

  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key?.startsWith("sk_test_")) {
    throw new Error(
      "Mock Stripe checkout preview requires a Stripe test-mode secret key.",
    );
  }
}

export interface CheckoutTaxMetadata {
  taxBehavior: "exclusive" | "inclusive";
  taxCode: string | null;
}

function checkoutLineItems(
  order: ShopCheckoutOrder,
  taxByVariantId: Record<string, CheckoutTaxMetadata> = {},
) {
  return order.lineItems.map((item) => {
    const tax = item.variant_id ? taxByVariantId[item.variant_id] : undefined;
    return {
      quantity: item.quantity,
      price_data: {
        currency: "eur",
        unit_amount: item.unit_price_cents,
        ...(tax ? { tax_behavior: tax.taxBehavior } : {}),
        product_data: {
          name: `${item.product_title} - ${item.variant_title}`,
          ...(tax?.taxCode ? { tax_code: tax.taxCode } : {}),
          metadata: {
            productId: item.product_id ?? "",
            variantId: item.variant_id ?? "",
            sku: item.sku ?? "",
          },
        },
      },
    };
  });
}

function shippingOption(
  zone: ShopShippingZone,
  rate: ShopShippingRate,
) {
  return {
    shipping_rate_data: {
      type: "fixed_amount" as const,
      display_name: rate.name,
      fixed_amount: {
        amount: rate.price_cents,
        currency: "eur" as const,
      },
      metadata: {
        zoneId: zone.id,
        rateId: rate.id,
        zoneSlug: zone.slug,
      },
      tax_behavior: rate.tax_behavior,
      ...(rate.stripe_tax_code ? { tax_code: rate.stripe_tax_code } : {}),
    },
  };
}

export async function createShopCheckoutSession(input: {
  order: ShopCheckoutOrder;
  profileId: string;
  customerEmail: string;
  taxByVariantId?: Record<string, CheckoutTaxMetadata>;
  shippingZone?: ShopShippingZone | null;
  shippingRate?: ShopShippingRate | null;
  metadata?: Record<string, string>;
  successUrl?: string;
  cancelUrl?: string;
  idempotencyKey?: string;
}) {
  const stripe = getStripe();
  const siteUrl = getPublicSiteUrl();
  const needsShipping = input.order.requiresShipping;

  if (needsShipping && (!input.shippingZone || !input.shippingRate)) {
    throw new Error("Choose a shipping country before checkout.");
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    client_reference_id: input.order.orderId,
    customer_email: input.customerEmail,
    customer_creation: "always",
    billing_address_collection: "auto",
    line_items: checkoutLineItems(input.order, input.taxByVariantId),
    success_url:
      input.successUrl ??
      `${siteUrl}/shop/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:
      input.cancelUrl ??
      `${siteUrl}/shop/checkout/canceled?order_id=${input.order.orderId}`,
    metadata: {
      orderId: input.order.orderId,
      orderNumber: input.order.orderNumber,
      profileId: input.profileId,
      checkoutAttemptId: input.order.checkoutAttemptId,
      ...input.metadata,
    },
    automatic_tax: { enabled: true },
    expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
    ...(needsShipping
      ? {
          shipping_address_collection: {
            allowed_countries: input.shippingZone!.allowed_countries as never,
          },
          shipping_options: [
            shippingOption(input.shippingZone!, input.shippingRate!),
          ],
        }
      : {}),
  }, {
    idempotencyKey:
      input.idempotencyKey ??
      `shop_checkout_${input.order.orderId}_${input.order.checkoutAttemptId}`,
  });

  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  return session;
}

export async function expireShopCheckoutSession(sessionId: string) {
  await getStripe().checkout.sessions.expire(sessionId);
}

export async function retrieveShopCheckoutSession(sessionId: string) {
  return getStripe().checkout.sessions.retrieve(sessionId);
}

export function constructShopStripeEvent(input: {
  body: string;
  signature: string | null;
}) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) throw new Error("Missing STRIPE_WEBHOOK_SECRET");
  if (!input.signature) throw new Error("Missing Stripe signature");
  return getStripe().webhooks.constructEvent(
    input.body,
    input.signature,
    webhookSecret,
  );
}
