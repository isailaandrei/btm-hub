import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShopCheckoutOrder } from "./types";
import type { ShopShippingRate, ShopShippingZone } from "@/types/database";

const stripeMocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  createSession: vi.fn(),
  expireSession: vi.fn(),
  retrieveSession: vi.fn(),
}));

vi.mock("stripe", () => ({
  default: vi.fn().mockImplementation(function Stripe() {
    return {
      checkout: {
        sessions: {
          create: stripeMocks.createSession,
          expire: stripeMocks.expireSession,
          retrieve: stripeMocks.retrieveSession,
        },
      },
      webhooks: {
        constructEvent: stripeMocks.constructEvent,
      },
    };
  }),
}));

function checkoutOrder(overrides: Partial<ShopCheckoutOrder> = {}): ShopCheckoutOrder {
  return {
    orderId: "order-1",
    orderNumber: "BTM-1",
    checkoutAttemptId: "attempt-123",
    reservationExpiresAt: "2026-05-08T10:30:00.000Z",
    stripeCheckoutSessionId: null,
    stripeCheckoutUrl: null,
    subtotalCents: 7900,
    requiresShipping: true,
    lineItems: [
      {
        id: "item-1",
        order_id: "order-1",
        product_id: "product-1",
        variant_id: "variant-1",
        product_title: "BTM Hoodie",
        variant_title: "Black / M",
        sku: "BTM-HOODIE-M",
        product_type: "physical",
        fulfillment_type: "physical",
        quantity: 2,
        unit_price_cents: 7900,
        line_subtotal_cents: 15800,
        tax_cents: 0,
        sort_order: 0,
        created_at: "2026-05-08T10:00:00.000Z",
      },
    ],
    ...overrides,
  };
}

const shippingZone: ShopShippingZone = {
  id: "zone-1",
  name: "Portugal",
  slug: "portugal",
  allowed_countries: ["PT"],
  active: true,
  sort_order: 0,
  created_at: "2026-05-08T10:00:00.000Z",
  updated_at: "2026-05-08T10:00:00.000Z",
};

const shippingRate: ShopShippingRate = {
  id: "rate-1",
  zone_id: "zone-1",
  name: "Tracked shipping",
  description: "Tracked shipping in Portugal.",
  price_cents: 500,
  currency: "eur",
  stripe_tax_code: "txcd_92010001",
  tax_behavior: "exclusive",
  active: true,
  sort_order: 0,
  created_at: "2026-05-08T10:00:00.000Z",
  updated_at: "2026-05-08T10:00:00.000Z",
};

describe("shop Stripe integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_123";
    process.env.NEXT_PUBLIC_SITE_URL = "https://btm.example";
    stripeMocks.createSession.mockResolvedValue({
      id: "cs_test_123",
      url: "https://checkout.stripe.com/c/pay/cs_test_123",
    });
  });

  it("creates Checkout Sessions with tax, shipping, customer creation, and idempotency", async () => {
    const { createShopCheckoutSession } = await import("./stripe");

    await createShopCheckoutSession({
      order: checkoutOrder(),
      profileId: "profile-1",
      customerEmail: "member@example.com",
      taxByVariantId: {
        "variant-1": {
          taxBehavior: "exclusive",
          taxCode: "txcd_99999999",
        },
      },
      shippingZone,
      shippingRate,
    });

    expect(stripeMocks.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "payment",
        payment_method_types: ["card"],
        client_reference_id: "order-1",
        customer_email: "member@example.com",
        customer_creation: "always",
        automatic_tax: { enabled: true },
        shipping_address_collection: { allowed_countries: ["PT"] },
        shipping_options: [
          expect.objectContaining({
            shipping_rate_data: expect.objectContaining({
              display_name: "Tracked shipping",
              tax_behavior: "exclusive",
              tax_code: "txcd_92010001",
            }),
          }),
        ],
        line_items: [
          expect.objectContaining({
            quantity: 2,
            price_data: expect.objectContaining({
              unit_amount: 7900,
              tax_behavior: "exclusive",
              product_data: expect.objectContaining({
                name: "BTM Hoodie - Black / M",
                tax_code: "txcd_99999999",
              }),
            }),
          }),
        ],
      }),
      { idempotencyKey: "shop_checkout_order-1_attempt-123" },
    );
  });

  it("retrieves Checkout Sessions for reservation reconciliation", async () => {
    const { retrieveShopCheckoutSession } = await import("./stripe");

    stripeMocks.retrieveSession.mockResolvedValueOnce({
      id: "cs_test_123",
      status: "expired",
    });

    await expect(retrieveShopCheckoutSession("cs_test_123")).resolves.toMatchObject({
      id: "cs_test_123",
      status: "expired",
    });
    expect(stripeMocks.retrieveSession).toHaveBeenCalledWith("cs_test_123");
  });

  it("allows mock checkout metadata and URLs while still using Stripe Checkout", async () => {
    const { createShopCheckoutSession } = await import("./stripe");

    await createShopCheckoutSession({
      order: checkoutOrder({
        orderId: "mock-shop-order",
        orderNumber: "MOCK-SHOP",
      }),
      profileId: "profile-1",
      customerEmail: "member@example.com",
      shippingZone,
      shippingRate,
      metadata: { mockCheckoutPreview: "1" },
      successUrl: "https://btm.example/shop/checkout/success?mock=1&session_id={CHECKOUT_SESSION_ID}",
      cancelUrl: "https://btm.example/shop/checkout/canceled?mock=1",
      idempotencyKey: "mock_shop_checkout_profile-1_attempt-123",
    });

    expect(stripeMocks.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        success_url: "https://btm.example/shop/checkout/success?mock=1&session_id={CHECKOUT_SESSION_ID}",
        cancel_url: "https://btm.example/shop/checkout/canceled?mock=1",
        metadata: expect.objectContaining({
          orderId: "mock-shop-order",
          mockCheckoutPreview: "1",
        }),
      }),
      { idempotencyKey: "mock_shop_checkout_profile-1_attempt-123" },
    );
  });

  it("blocks mock checkout previews with live Stripe keys", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_live_123";
    const { assertMockStripeCheckoutPreviewAllowed } = await import("./stripe");

    expect(() => assertMockStripeCheckoutPreviewAllowed()).toThrow(
      "Mock Stripe checkout preview requires a Stripe test-mode secret key.",
    );
  });

  it("blocks mock checkout previews in production", async () => {
    process.env.VERCEL_ENV = "production";
    const { assertMockStripeCheckoutPreviewAllowed } = await import("./stripe");

    expect(() => assertMockStripeCheckoutPreviewAllowed()).toThrow(
      "Mock Stripe checkout preview is disabled in production.",
    );
    delete process.env.VERCEL_ENV;
  });
});
