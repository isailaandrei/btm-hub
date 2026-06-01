import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSendPendingShopOrderNotifications = vi.fn();

vi.mock("@/lib/shop/order-emails", () => ({
  sendPendingShopOrderNotifications: mockSendPendingShopOrderNotifications,
}));

const { GET, POST } = await import("./route");

describe("shop order notification worker route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "cron-secret";
    process.env.EMAIL_WORKER_SECRET = "email-secret";
    mockSendPendingShopOrderNotifications.mockResolvedValue({ sent: 1, failed: 0 });
  });

  it("allows Vercel cron GET requests authenticated with CRON_SECRET", async () => {
    const response = await GET(
      new Request("http://localhost/api/shop/orders/process-notifications", {
        headers: { authorization: "Bearer cron-secret" },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ sent: 1, failed: 0 });
  });

  it("keeps POST support for the email worker secret", async () => {
    const response = await POST(
      new Request("http://localhost/api/shop/orders/process-notifications", {
        method: "POST",
        headers: { authorization: "Bearer email-secret" },
      }),
    );

    expect(response.status).toBe(200);
  });
});
