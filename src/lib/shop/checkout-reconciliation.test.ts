import { describe, expect, it, vi } from "vitest";

import { reconcileCheckoutOrders } from "./checkout-reconciliation";

describe("checkout reconciliation", () => {
  it("finalizes paid sessions and releases expired unpaid sessions", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { ok: true }, error: null });
    const retrieveSession = vi
      .fn()
      .mockResolvedValueOnce({
        id: "cs_paid",
        status: "complete",
        payment_status: "paid",
      })
      .mockResolvedValueOnce({
        id: "cs_expired",
        status: "expired",
        payment_status: "unpaid",
      });

    const result = await reconcileCheckoutOrders({
      supabase: { rpc },
      orders: [
        { id: "order-paid", stripe_checkout_session_id: "cs_paid" },
        { id: "order-expired", stripe_checkout_session_id: "cs_expired" },
      ],
      retrieveSession,
    });

    expect(result).toEqual({
      checked: 2,
      finalized: 1,
      released: 1,
      skipped: 0,
      failed: 0,
    });
    expect(rpc).toHaveBeenCalledWith("shop_finalize_paid_order_from_checkout", {
      p_event_id: "reconcile_checkout_completed_cs_paid",
      p_session: expect.objectContaining({ id: "cs_paid" }),
    });
    expect(rpc).toHaveBeenCalledWith("shop_release_order_for_checkout_session", {
      p_event_id: "reconcile_checkout_expired_cs_expired",
      p_stripe_checkout_session_id: "cs_expired",
    });
  });
});
