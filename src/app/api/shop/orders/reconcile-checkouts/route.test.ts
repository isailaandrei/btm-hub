import { beforeEach, describe, expect, it, vi } from "vitest";

const mockReconcileStaleCheckoutSessions = vi.fn();

vi.mock("@/lib/shop/checkout-reconciliation", () => ({
  reconcileStaleCheckoutSessions: mockReconcileStaleCheckoutSessions,
}));

const { GET } = await import("./route");

describe("shop checkout reconciliation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "cron-secret";
    mockReconcileStaleCheckoutSessions.mockResolvedValue({
      checked: 1,
      finalized: 0,
      released: 1,
      skipped: 0,
      failed: 0,
    });
  });

  it("runs only for cron requests authenticated with CRON_SECRET", async () => {
    const unauthorized = await GET(
      new Request("http://localhost/api/shop/orders/reconcile-checkouts"),
    );
    expect(unauthorized.status).toBe(401);

    const response = await GET(
      new Request("http://localhost/api/shop/orders/reconcile-checkouts", {
        headers: { authorization: "Bearer cron-secret" },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      checked: 1,
      finalized: 0,
      released: 1,
      skipped: 0,
      failed: 0,
    });
  });
});
