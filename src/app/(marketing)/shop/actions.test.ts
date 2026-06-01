import { describe, expect, it, vi, beforeEach } from "vitest";
import { LEGACY_MOCK_SHOP_VARIANT_HOODIE_M_ID } from "@/lib/shop/mock-product-ids";

const REAL_VARIANT_ID = "00000000-0000-4000-8000-000000000101";

const mockCreateClient = vi.fn();
const mockCreateAdminClient = vi.fn();
const mockBeginShopCheckout = vi.fn();
const mockAttachShopCheckoutSession = vi.fn();
const mockReleaseShopOrderReservations = vi.fn();
const mockCreateShopCheckoutSession = vi.fn();
const mockExpireShopCheckoutSession = vi.fn();
const mockAssertMockStripeCheckoutPreviewAllowed = vi.fn();
const mockListActiveShippingZones = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: mockCreateClient,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mockCreateAdminClient,
}));

vi.mock("@/lib/shop/checkout", () => ({
  beginShopCheckout: mockBeginShopCheckout,
  attachShopCheckoutSession: mockAttachShopCheckoutSession,
  releaseShopOrderReservations: mockReleaseShopOrderReservations,
}));

vi.mock("@/lib/shop/stripe", () => ({
  assertMockStripeCheckoutPreviewAllowed: mockAssertMockStripeCheckoutPreviewAllowed,
  createShopCheckoutSession: mockCreateShopCheckoutSession,
  expireShopCheckoutSession: mockExpireShopCheckoutSession,
}));

vi.mock("@/lib/data/shop-shipping", () => ({
  listActiveShippingZones: mockListActiveShippingZones,
  findShippingZoneForCountry: (zones: Array<{ allowed_countries: string[] }>, code: string) =>
    zones.find((zone) => zone.allowed_countries.includes(code)) ?? null,
  allowedShippingCountries: (zones: Array<{ allowed_countries: string[] }>) =>
    zones.flatMap((zone) => zone.allowed_countries),
}));

const { startShopCheckoutAction } = await import("./actions");

function supabaseForUser(user: { id: string } | null = { id: "profile-1" }) {
  const profileQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: user
        ? { id: user.id, email: "member@example.com", role: "member" }
        : null,
      error: null,
    }),
  };
  const taxQuery = {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({ data: [], error: null }),
  };

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
    },
    from: vi.fn((table: string) =>
      table === "profiles" ? profileQuery : taxQuery,
    ),
    rpc: vi.fn(),
  };
}

describe("shop checkout action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_SHOW_MOCK_SHOP_PRODUCT;
    mockCreateClient.mockResolvedValue(supabaseForUser());
    mockCreateAdminClient.mockResolvedValue({ rpc: vi.fn() });
    mockListActiveShippingZones.mockResolvedValue([]);
    mockBeginShopCheckout.mockResolvedValue({
      orderId: "order-1",
      orderNumber: "BTM-1",
      checkoutAttemptId: "attempt-123",
      reservationExpiresAt: "2026-05-08T10:30:00.000Z",
      stripeCheckoutSessionId: null,
      stripeCheckoutUrl: null,
      subtotalCents: 7900,
      requiresShipping: false,
      lineItems: [],
    });
    mockCreateShopCheckoutSession.mockResolvedValue({
      id: "cs_test_123",
      url: "https://checkout.stripe.com/c/pay/cs_test_123",
    });
  });

  it("requires a logged in member", async () => {
    mockCreateClient.mockResolvedValue(supabaseForUser(null));

    const result = await startShopCheckoutAction({
      checkoutAttemptId: "attempt-123",
      lines: [{ variantId: REAL_VARIANT_ID, quantity: 1 }],
    });

    expect(result.success).toBe(false);
    expect(result.message).toBe("Log in to checkout.");
    expect(mockBeginShopCheckout).not.toHaveBeenCalled();
  });

  it("reserves the cart, creates Stripe Checkout, and attaches the session", async () => {
    const result = await startShopCheckoutAction({
      checkoutAttemptId: "attempt-123",
      lines: [{ variantId: REAL_VARIANT_ID, quantity: 1 }],
      customerNotes: "Thanks",
    });

    expect(result).toMatchObject({
      success: true,
      checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_123",
      orderId: "order-1",
    });
    expect(mockBeginShopCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: "profile-1",
        checkoutAttemptId: "attempt-123",
      }),
    );
    expect(mockAttachShopCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: "order-1",
        stripeCheckoutSessionId: "cs_test_123",
      }),
    );
  });

  it("reuses an existing Stripe Checkout URL for the same reserved cart", async () => {
    mockBeginShopCheckout.mockResolvedValueOnce({
      orderId: "order-1",
      orderNumber: "BTM-1",
      checkoutAttemptId: "attempt-123",
      reservationExpiresAt: "2026-05-08T10:30:00.000Z",
      stripeCheckoutSessionId: "cs_test_123",
      stripeCheckoutUrl: "https://checkout.stripe.com/c/pay/cs_test_123",
      subtotalCents: 7900,
      requiresShipping: false,
      lineItems: [],
    });

    const result = await startShopCheckoutAction({
      checkoutAttemptId: "attempt-123",
      lines: [{ variantId: REAL_VARIANT_ID, quantity: 1 }],
    });

    expect(result).toMatchObject({
      success: true,
      checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_123",
    });
    expect(mockCreateShopCheckoutSession).not.toHaveBeenCalled();
    expect(mockAttachShopCheckoutSession).not.toHaveBeenCalled();
  });

  it("releases the reservation if shipping cannot be resolved", async () => {
    mockBeginShopCheckout.mockResolvedValueOnce({
      orderId: "order-1",
      orderNumber: "BTM-1",
      checkoutAttemptId: "attempt-123",
      reservationExpiresAt: "2026-05-08T10:30:00.000Z",
      stripeCheckoutSessionId: null,
      stripeCheckoutUrl: null,
      subtotalCents: 7900,
      requiresShipping: true,
      lineItems: [],
    });

    const result = await startShopCheckoutAction({
      checkoutAttemptId: "attempt-123",
      lines: [{ variantId: REAL_VARIANT_ID, quantity: 1 }],
    });

    expect(result.success).toBe(false);
    expect(result.message).toBe("Choose a shipping country before checkout.");
    expect(mockReleaseShopOrderReservations).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: "order-1" }),
    );
  });

  it("creates a Stripe Checkout preview for mock products without reserving database inventory", async () => {
    process.env.NEXT_PUBLIC_SHOW_MOCK_SHOP_PRODUCT = "1";
    mockListActiveShippingZones.mockResolvedValue([
      {
        id: "mock-zone",
        name: "Portugal",
        slug: "mock-portugal",
        allowed_countries: ["PT"],
        rates: [
          {
            id: "mock-rate",
            name: "Mock shipping",
            price_cents: 500,
            currency: "eur",
            tax_behavior: "exclusive",
          },
        ],
      },
    ]);

    const result = await startShopCheckoutAction({
      checkoutAttemptId: "attempt-123",
      lines: [{ variantId: LEGACY_MOCK_SHOP_VARIANT_HOODIE_M_ID, quantity: 1 }],
      shippingCountry: "PT",
    });

    expect(result).toMatchObject({
      success: true,
      checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_123",
      orderId: "mock-shop-order",
    });
    expect(mockBeginShopCheckout).not.toHaveBeenCalled();
    expect(mockCreateShopCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: "profile-1",
        customerEmail: "member@example.com",
        shippingZone: expect.objectContaining({ slug: "mock-portugal" }),
        shippingRate: expect.objectContaining({ id: "mock-rate" }),
        metadata: { mockCheckoutPreview: "1" },
        successUrl: "http://localhost:3000/shop/checkout/success?mock=1&session_id={CHECKOUT_SESSION_ID}",
      }),
    );
  });

  it("refuses mock Stripe previews when the Stripe key is not test-mode safe", async () => {
    process.env.NEXT_PUBLIC_SHOW_MOCK_SHOP_PRODUCT = "1";
    mockAssertMockStripeCheckoutPreviewAllowed.mockImplementationOnce(() => {
      throw new Error("Mock Stripe checkout preview requires a Stripe test-mode secret key.");
    });

    const result = await startShopCheckoutAction({
      checkoutAttemptId: "attempt-123",
      lines: [{ variantId: LEGACY_MOCK_SHOP_VARIANT_HOODIE_M_ID, quantity: 1 }],
      shippingCountry: "PT",
    });

    expect(result.success).toBe(false);
    expect(result.message).toBe(
      "Mock Stripe checkout preview requires a Stripe test-mode secret key.",
    );
    expect(mockCreateShopCheckoutSession).not.toHaveBeenCalled();
  });
});
