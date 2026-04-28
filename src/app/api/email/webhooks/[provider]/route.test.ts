import { describe, expect, it, vi } from "vitest";

const mockVerifyWebhookSignature = vi.fn().mockResolvedValue(true);
const mockParseWebhook = vi.fn().mockResolvedValue({
  kind: "event",
  event: {
    type: "delivered",
    provider: "fake",
    providerEventId: "evt-1",
    providerMessageId: "fake-recipient-1",
    occurredAt: "2026-04-28T12:00:00.000Z",
    payload: { id: "evt-1" },
  },
});
const mockApplyProviderEvent = vi.fn().mockResolvedValue(undefined);
const mockStoreInboundReplyAndForward = vi.fn();

vi.mock("@/lib/email/provider", () => ({
  getEmailProvider: () => ({
    name: "fake",
    verifyWebhookSignature: mockVerifyWebhookSignature,
    parseWebhook: mockParseWebhook,
  }),
}));

vi.mock("@/lib/data/email-campaigns", () => ({
  applyProviderEvent: mockApplyProviderEvent,
  storeInboundReplyAndForward: mockStoreInboundReplyAndForward,
}));

const { POST } = await import("./route");

describe("email webhook route", () => {
  it("accepts verified provider events", async () => {
    const request = new Request("http://localhost/api/email/webhooks/fake", {
      method: "POST",
      body: JSON.stringify({ id: "evt-1" }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ provider: "fake" }),
    });

    expect(response.status).toBe(200);
    expect(mockApplyProviderEvent).toHaveBeenCalledWith({
      type: "delivered",
      provider: "fake",
      providerEventId: "evt-1",
      providerMessageId: "fake-recipient-1",
      occurredAt: "2026-04-28T12:00:00.000Z",
      payload: { id: "evt-1" },
    });
  });
});
