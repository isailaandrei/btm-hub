"use server";

import { z } from "zod/v4";
import {
  allowedShippingCountries,
  findShippingZoneForCountry,
  listActiveShippingZones,
} from "@/lib/data/shop-shipping";
import {
  attachShopCheckoutSession,
  beginShopCheckout,
  releaseShopOrderReservations,
} from "@/lib/shop/checkout";
import {
  cartCheckoutInputSchema,
  normalizeCartLines,
} from "@/lib/shop/cart-validation";
import {
  MOCK_SHOP_PRODUCT,
  shouldShowMockShopProduct,
} from "@/lib/shop/mock-product";
import { isMockShopVariantId } from "@/lib/shop/mock-product-ids";
import {
  assertMockStripeCheckoutPreviewAllowed,
  type CheckoutTaxMetadata,
  createShopCheckoutSession,
  expireShopCheckoutSession,
} from "@/lib/shop/stripe";
import { getPublicSiteUrl } from "@/lib/email/settings";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ShopCheckoutOrder } from "@/lib/shop/types";
import type { ShopOrderItem } from "@/types/database";

export interface ShopCheckoutActionState {
  success: boolean;
  message: string | null;
  checkoutUrl: string | null;
  orderId: string | null;
  errors: Record<string, string[]> | null;
}

function validationErrors(error: z.ZodError) {
  const errors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    errors[key] = [...(errors[key] ?? []), issue.message];
  }
  return errors;
}

function checkoutError(message: string, errors: Record<string, string[]> | null = null): ShopCheckoutActionState {
  return {
    success: false,
    message,
    checkoutUrl: null,
    orderId: null,
    errors,
  };
}

function normalizeCheckoutError(error: unknown) {
  if (!(error instanceof Error)) return "Checkout failed.";
  const message = error.message;
  if (message.includes("membership_required")) {
    return "Checkout is currently available to members.";
  }
  if (message.includes("insufficient_stock")) {
    return "One or more cart items no longer has enough stock.";
  }
  if (message.includes("cart_variant_unavailable")) {
    return "One or more cart items is no longer available.";
  }
  if (message.includes("cart_product_unavailable")) {
    return "One or more cart products is no longer available.";
  }
  if (message.includes("checkout_attempt_conflict")) {
    return "This checkout attempt changed. Refresh your cart and try again.";
  }
  return message;
}

async function startMockShopCheckoutPreview(input: {
  profileId: string;
  customerEmail: string;
  checkoutAttemptId: string;
  lines: ReturnType<typeof normalizeCartLines>;
  shippingCountry?: string;
}): Promise<ShopCheckoutActionState> {
  assertMockStripeCheckoutPreviewAllowed();

  const zones = await listActiveShippingZones();
  const shippingCountry = input.shippingCountry?.toUpperCase();
  const shippingZone = shippingCountry
    ? findShippingZoneForCountry(zones, shippingCountry)
    : null;
  const shippingRate = shippingZone?.rates[0] ?? null;

  if (!shippingCountry) {
    return checkoutError("Choose a shipping country before checkout.");
  }
  if (!shippingZone || !shippingRate) {
    return checkoutError(
      `Shipping is not configured for ${shippingCountry}. Supported countries: ${allowedShippingCountries(zones).join(", ")}`,
    );
  }

  const order = mockShopCheckoutOrder({
    checkoutAttemptId: input.checkoutAttemptId,
    lines: input.lines,
  });
  const siteUrl = getPublicSiteUrl();
  const session = await createShopCheckoutSession({
    order,
    profileId: input.profileId,
    customerEmail: input.customerEmail,
    taxByVariantId: mockShopTaxMetadata(),
    shippingZone,
    shippingRate,
    metadata: { mockCheckoutPreview: "1" },
    successUrl: `${siteUrl}/shop/checkout/success?mock=1&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${siteUrl}/shop/checkout/canceled?mock=1`,
    idempotencyKey: `mock_shop_checkout_${input.profileId}_${input.checkoutAttemptId}_${shippingCountry}`,
  });

  return {
    success: true,
    message: null,
    checkoutUrl: session.url!,
    orderId: order.orderId,
    errors: null,
  };
}

function mockShopCheckoutOrder(input: {
  checkoutAttemptId: string;
  lines: ReturnType<typeof normalizeCartLines>;
}): ShopCheckoutOrder {
  const variantById = new Map(
    MOCK_SHOP_PRODUCT.variants.map((variant) => [variant.id, variant]),
  );
  const lineItems: ShopOrderItem[] = input.lines.map((line, index) => {
    const variant = variantById.get(line.variantId);
    if (!variant) throw new Error("cart_variant_unavailable");
    const lineSubtotalCents = variant.price_cents * line.quantity;

    return {
      id: `mock-shop-order-item-${index + 1}`,
      order_id: "mock-shop-order",
      product_id: MOCK_SHOP_PRODUCT.id,
      variant_id: variant.id,
      product_title: MOCK_SHOP_PRODUCT.title,
      variant_title: variant.title,
      sku: variant.sku,
      product_type: MOCK_SHOP_PRODUCT.type,
      fulfillment_type: "physical",
      quantity: line.quantity,
      unit_price_cents: variant.price_cents,
      line_subtotal_cents: lineSubtotalCents,
      tax_cents: 0,
      sort_order: index,
      created_at: new Date().toISOString(),
    };
  });

  return {
    orderId: "mock-shop-order",
    orderNumber: "MOCK-SHOP",
    checkoutAttemptId: input.checkoutAttemptId,
    reservationExpiresAt: new Date(Date.now() + 31 * 60 * 1000).toISOString(),
    stripeCheckoutSessionId: null,
    stripeCheckoutUrl: null,
    subtotalCents: lineItems.reduce(
      (sum, item) => sum + item.line_subtotal_cents,
      0,
    ),
    requiresShipping: MOCK_SHOP_PRODUCT.requires_shipping,
    lineItems,
  };
}

function mockShopTaxMetadata(): Record<string, CheckoutTaxMetadata> {
  return Object.fromEntries(
    MOCK_SHOP_PRODUCT.variants.map((variant) => [
      variant.id,
      {
        taxBehavior: variant.tax_behavior ?? MOCK_SHOP_PRODUCT.tax_behavior,
        taxCode:
          variant.stripe_tax_code || MOCK_SHOP_PRODUCT.stripe_tax_code || null,
      },
    ]),
  );
}

async function loadCheckoutTaxMetadata(
  supabase: Awaited<ReturnType<typeof createClient>>,
  variantIds: string[],
) {
  if (variantIds.length === 0) return {};
  const { data, error } = await supabase
    .from("shop_product_variants")
    .select("id, stripe_tax_code, tax_behavior, product:shop_products(stripe_tax_code, tax_behavior)")
    .in("id", variantIds);

  if (error) throw new Error(`Failed to load checkout tax metadata: ${error.message}`);

  const taxByVariantId: Record<string, CheckoutTaxMetadata> = {};
  for (const row of data ?? []) {
    const variant = row as {
      id: string;
      stripe_tax_code: string | null;
      tax_behavior: "exclusive" | "inclusive";
      product:
        | { stripe_tax_code: string | null; tax_behavior: "exclusive" | "inclusive" }
        | Array<{ stripe_tax_code: string | null; tax_behavior: "exclusive" | "inclusive" }>
        | null;
    };
    const product = Array.isArray(variant.product)
      ? variant.product[0]
      : variant.product;
    taxByVariantId[variant.id] = {
      taxBehavior: variant.tax_behavior ?? product?.tax_behavior ?? "exclusive",
      taxCode: variant.stripe_tax_code || product?.stripe_tax_code || null,
    };
  }
  return taxByVariantId;
}

export async function startShopCheckoutAction(
  input: unknown,
): Promise<ShopCheckoutActionState> {
  const parsed = cartCheckoutInputSchema.safeParse(input);
  if (!parsed.success) {
    return checkoutError("Check your cart before checkout.", validationErrors(parsed.error));
  }

  const lines = normalizeCartLines(parsed.data.lines);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return checkoutError("Log in to checkout.");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, email, role")
    .eq("id", user.id)
    .single();

  if (profileError) {
    return checkoutError(`Failed to load your profile: ${profileError.message}`);
  }
  if (!profile || !["member", "admin"].includes(String(profile.role))) {
    return checkoutError("Checkout is currently available to members.");
  }

  const hasMockLine = lines.some((line) => isMockShopVariantId(line.variantId));
  if (hasMockLine) {
    if (!shouldShowMockShopProduct()) {
      return checkoutError("One or more cart items is no longer available.");
    }
    if (!lines.every((line) => isMockShopVariantId(line.variantId))) {
      return checkoutError("Mock preview items cannot be checked out with real catalog items.");
    }

    try {
      return await startMockShopCheckoutPreview({
        profileId: user.id,
        customerEmail: String(profile.email),
        checkoutAttemptId: parsed.data.checkoutAttemptId,
        lines,
        shippingCountry: parsed.data.shippingCountry,
      });
    } catch (error) {
      return checkoutError(normalizeCheckoutError(error));
    }
  }

  let orderId: string | null = null;
  let unattachedStripeSessionId: string | null = null;
  let adminSupabase: Awaited<ReturnType<typeof createAdminClient>> | null = null;

  try {
    adminSupabase = await createAdminClient();
    const order = await beginShopCheckout({
      supabase,
      profileId: user.id,
      checkoutAttemptId: parsed.data.checkoutAttemptId,
      lines,
      customerNotes: parsed.data.customerNotes,
    });
    orderId = order.orderId;

    if (order.stripeCheckoutUrl) {
      return {
        success: true,
        message: null,
        checkoutUrl: order.stripeCheckoutUrl,
        orderId: order.orderId,
        errors: null,
      };
    }

    const zones = await listActiveShippingZones();
    const shippingCountry = parsed.data.shippingCountry?.toUpperCase();
    const shippingZone =
      order.requiresShipping && shippingCountry
        ? findShippingZoneForCountry(zones, shippingCountry)
        : null;
    const shippingRate = shippingZone?.rates[0] ?? null;

    if (order.requiresShipping && !shippingCountry) {
      throw new Error("Choose a shipping country before checkout.");
    }
    if (order.requiresShipping && (!shippingZone || !shippingRate)) {
      throw new Error(
        `Shipping is not configured for ${shippingCountry}. Supported countries: ${allowedShippingCountries(zones).join(", ")}`,
      );
    }

    const session = await createShopCheckoutSession({
      order,
      profileId: user.id,
      customerEmail: String(profile.email),
      taxByVariantId: await loadCheckoutTaxMetadata(
        supabase,
        order.lineItems
          .map((item) => item.variant_id)
          .filter((id): id is string => Boolean(id)),
      ),
      shippingZone,
      shippingRate,
    });
    unattachedStripeSessionId = session.id;

    await attachShopCheckoutSession({
      supabase: adminSupabase,
      orderId: order.orderId,
      profileId: user.id,
      checkoutAttemptId: order.checkoutAttemptId,
      stripeCheckoutSessionId: session.id,
      stripeCheckoutUrl: session.url!,
    });
    unattachedStripeSessionId = null;

    return {
      success: true,
      message: null,
      checkoutUrl: session.url!,
      orderId: order.orderId,
      errors: null,
    };
  } catch (error) {
    if (unattachedStripeSessionId) {
      try {
        await expireShopCheckoutSession(unattachedStripeSessionId);
      } catch {
        // The reservation release and checkout error remain the actionable result.
      }
    }
    if (orderId) {
      try {
        await releaseShopOrderReservations({
          supabase: adminSupabase ?? (await createAdminClient()),
          orderId,
        });
      } catch {
        // The checkout error remains the primary user-facing failure.
      }
    }
    return checkoutError(normalizeCheckoutError(error));
  }
}
