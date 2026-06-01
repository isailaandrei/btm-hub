import { describe, expect, it, vi } from "vitest";
import {
  attachShopCheckoutSession,
  beginShopCheckout,
  releaseShopOrderReservations,
} from "./checkout";

describe("shop checkout RPC wrappers", () => {
  it("begins checkout with the reservation RPC payload", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          order_id: "order-1",
          order_number: "BTM-1",
          checkout_attempt_id: "attempt-123",
          reservation_expires_at: "2026-05-08T10:30:00.000Z",
          stripe_checkout_session_id: null,
          stripe_checkout_url: null,
          subtotal_cents: 7900,
          requires_shipping: true,
          line_items: [],
        },
      ],
      error: null,
    });

    const order = await beginShopCheckout({
      supabase: { rpc },
      profileId: "profile-1",
      checkoutAttemptId: "attempt-123",
      lines: [{ variantId: "variant-1", quantity: 1 }],
      customerNotes: "Leave at the marina.",
      now: new Date("2026-05-08T10:00:00.000Z"),
    });

    expect(rpc).toHaveBeenCalledWith("shop_begin_checkout", {
      p_profile_id: "profile-1",
      p_checkout_attempt_id: "attempt-123",
      p_lines: [{ variantId: "variant-1", quantity: 1 }],
      p_customer_notes: "Leave at the marina.",
      p_reservation_expires_at: "2026-05-08T10:30:00.000Z",
    });
    expect(order.orderId).toBe("order-1");
    expect(order.requiresShipping).toBe(true);
  });

  it("attaches Stripe checkout sessions through the RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });

    await attachShopCheckoutSession({
      supabase: { rpc },
      orderId: "order-1",
      profileId: "profile-1",
      checkoutAttemptId: "attempt-123",
      stripeCheckoutSessionId: "cs_test_123",
      stripeCheckoutUrl: "https://checkout.stripe.com/c/pay/cs_test_123",
      shippingZoneId: "zone-1",
      shippingRateId: "rate-1",
      shippingCountry: "PT",
      shippingRateName: "Tracked shipping",
    });

    expect(rpc).toHaveBeenCalledWith("shop_attach_checkout_session", {
      p_order_id: "order-1",
      p_profile_id: "profile-1",
      p_checkout_attempt_id: "attempt-123",
      p_stripe_checkout_session_id: "cs_test_123",
      p_stripe_checkout_url: "https://checkout.stripe.com/c/pay/cs_test_123",
      p_shipping_zone_id: "zone-1",
      p_shipping_rate_id: "rate-1",
      p_shipping_country: "PT",
      p_shipping_rate_name: "Tracked shipping",
    });
  });

  it("releases reservations by order id", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 1, error: null });

    await releaseShopOrderReservations({ supabase: { rpc }, orderId: "order-1" });

    expect(rpc).toHaveBeenCalledWith("shop_release_inventory_reservations", {
      p_order_id: "order-1",
    });
  });
});
