import { beforeEach, describe, expect, it, vi } from "vitest";

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
  beforeEach(() => {
    mockApplyProviderEvent.mockClear();
    mockStoreInboundReplyAndForward.mockClear();
    mockParseWebhook.mockClear();
    mockVerifyWebhookSignature.mockClear();
  });

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

  it("routes inbound replies to the reply handler", async () => {
    mockParseWebhook.mockResolvedValueOnce({
      kind: "reply",
      reply: {
        provider: "fake",
        providerEventId: "reply-1",
        providerMessageId: "message-1",
        inboundTo: "r-recipient-1@replies.behind-the-mask.com",
        inboundFrom: "person@example.com",
        subject: "Re: Hello",
        textBody: "Thanks",
        htmlBody: "",
        attachmentMetadata: [],
        receivedAt: "2026-04-28T12:00:00.000Z",
        payload: { id: "reply-1" },
      },
    });

    const request = new Request("http://localhost/api/email/webhooks/fake", {
      method: "POST",
      body: JSON.stringify({ id: "reply-1" }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ provider: "fake" }),
    });

    expect(response.status).toBe(200);
    expect(mockStoreInboundReplyAndForward).toHaveBeenCalledWith(
      expect.objectContaining({ providerEventId: "reply-1" }),
      expect.objectContaining({ name: "fake" }),
    );
  });

  it("returns 400 for malformed JSON payloads", async () => {
    const request = new Request("http://localhost/api/email/webhooks/fake", {
      method: "POST",
      body: "{not-json",
    });

    const response = await POST(request, {
      params: Promise.resolve({ provider: "fake" }),
    });

    expect(response.status).toBe(400);
    expect(mockParseWebhook).not.toHaveBeenCalledWith(expect.anything());
  });
});
