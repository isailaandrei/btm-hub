import { beforeEach, describe, expect, it, vi } from "vitest";

const mockConstructShopStripeEvent = vi.fn();
const mockCreateAdminClient = vi.fn();
const mockSendPendingShopOrderNotifications = vi.fn();

vi.mock("@/lib/shop/stripe", () => ({
  constructShopStripeEvent: mockConstructShopStripeEvent,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mockCreateAdminClient,
}));

vi.mock("@/lib/shop/order-emails", () => ({
  sendPendingShopOrderNotifications: mockSendPendingShopOrderNotifications,
}));

const { POST } = await import("./route");

function stripeRequest() {
  return new Request("http://localhost/api/shop/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": "sig_123" },
    body: JSON.stringify({ id: "evt_123" }),
  });
}

describe("shop Stripe webhook route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateAdminClient.mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({ data: { ok: true }, error: null }),
    });
  });

  it("finalizes completed Checkout Sessions", async () => {
    const session = {
      id: "cs_test_123",
      metadata: { orderId: "order-1" },
    };
    mockConstructShopStripeEvent.mockReturnValue({
      id: "evt_123",
      type: "checkout.session.completed",
      data: { object: session },
    });

    const response = await POST(stripeRequest());

    expect(response.status).toBe(200);
    const supabase = await mockCreateAdminClient.mock.results[0]?.value;
    expect(supabase.rpc).toHaveBeenCalledWith(
      "shop_finalize_paid_order_from_checkout",
      {
        p_event_id: "evt_123",
        p_session: session,
      },
    );
    expect(mockSendPendingShopOrderNotifications).not.toHaveBeenCalled();
  });

  it("passes the Stripe event type when recording refunds", async () => {
    const refund = {
      id: "re_123",
      payment_intent: "pi_123",
      amount: 500,
      status: "succeeded",
    };
    mockConstructShopStripeEvent.mockReturnValue({
      id: "evt_refund",
      type: "refund.updated",
      data: { object: refund },
    });

    const response = await POST(stripeRequest());

    expect(response.status).toBe(200);
    const supabase = await mockCreateAdminClient.mock.results[0]?.value;
    expect(supabase.rpc).toHaveBeenCalledWith("shop_record_refund_event", {
      p_event_id: "evt_refund",
      p_event_type: "refund.updated",
      p_payload: refund,
    });
  });

  it("acknowledges mock Checkout preview events without touching Supabase", async () => {
    mockConstructShopStripeEvent.mockReturnValue({
      id: "evt_mock",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_mock",
          metadata: { mockCheckoutPreview: "1" },
        },
      },
    });

    const response = await POST(stripeRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ received: true, ignored: "mock_checkout_preview" });
    expect(mockCreateAdminClient).not.toHaveBeenCalled();
    expect(mockSendPendingShopOrderNotifications).not.toHaveBeenCalled();
  });

  it("rejects invalid Stripe webhook signatures before processing", async () => {
    mockConstructShopStripeEvent.mockImplementationOnce(() => {
      throw new Error("No signatures found matching the expected signature for payload.");
    });

    const response = await POST(stripeRequest());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: "No signatures found matching the expected signature for payload.",
    });
    expect(mockCreateAdminClient).not.toHaveBeenCalled();
  });
});
