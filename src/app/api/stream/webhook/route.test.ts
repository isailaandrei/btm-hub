import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateStreamServerClient = vi.fn();
const mockVerifyWebhook = vi.fn();
const mockCreateStreamMessageNotifications = vi.fn();
const mockGetStreamChatThreadNotificationContext = vi.fn();

vi.mock("server-only", () => ({}));

vi.mock("@/lib/stream/server", () => ({
  createStreamServerClient: mockCreateStreamServerClient,
}));

vi.mock("@/lib/data/stream-notifications", () => ({
  createStreamMessageNotifications: mockCreateStreamMessageNotifications,
}));

vi.mock("@/lib/data/chat-threads", () => ({
  getStreamChatThreadNotificationContext: mockGetStreamChatThreadNotificationContext,
}));

describe("POST /api/stream/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyWebhook.mockReturnValue(true);
    mockCreateStreamServerClient.mockReturnValue({
      verifyWebhook: mockVerifyWebhook,
    });
    mockCreateStreamMessageNotifications.mockResolvedValue(undefined);
    mockGetStreamChatThreadNotificationContext.mockResolvedValue({
      thread: {
        id: "00000000-0000-4000-8000-000000000099",
        provider_channel_id: "00000000-0000-4000-8000-000000000099",
        provider_channel_cid: "messaging:00000000-0000-4000-8000-000000000099",
      },
      recipientIds: ["recipient-1", "recipient-2"],
    });
  });

  it("rejects requests without a Stream signature", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/stream/webhook", {
        method: "POST",
        body: JSON.stringify({ type: "message.new" }),
      }),
    );

    expect(response.status).toBe(401);
    expect(mockVerifyWebhook).not.toHaveBeenCalled();
  });

  it("rejects requests with an invalid Stream signature", async () => {
    mockVerifyWebhook.mockReturnValue(false);
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/stream/webhook", {
        method: "POST",
        headers: { "x-signature": "bad-signature" },
        body: JSON.stringify({ type: "message.new" }),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("creates notifications from the app thread registry instead of webhook members", async () => {
    const payload = {
      type: "message.new",
      cid: "messaging:00000000-0000-4000-8000-000000000099",
      channel_id: "00000000-0000-4000-8000-000000000099",
      message: {
        id: "stream-message-1",
        text: "Hello from Stream",
        user: { id: "sender-1" },
      },
    };
    const body = JSON.stringify(payload);
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/stream/webhook", {
        method: "POST",
        headers: { "x-signature": "signature" },
        body,
      }),
    );

    expect(response.status).toBe(200);
    expect(mockVerifyWebhook).toHaveBeenCalledWith(body, "signature");
    expect(mockGetStreamChatThreadNotificationContext).toHaveBeenCalledWith({
      streamChannelCid: "messaging:00000000-0000-4000-8000-000000000099",
      senderId: "sender-1",
    });
    expect(mockCreateStreamMessageNotifications).toHaveBeenCalledTimes(1);
    expect(mockCreateStreamMessageNotifications).toHaveBeenCalledWith({
      threadId: "00000000-0000-4000-8000-000000000099",
      recipientIds: ["recipient-1", "recipient-2"],
      actorId: "sender-1",
      streamMessageId: "stream-message-1",
      streamChannelCid: "messaging:00000000-0000-4000-8000-000000000099",
      streamChannelId: "00000000-0000-4000-8000-000000000099",
      bodyPreview: "Hello from Stream",
    });
    await expect(response.json()).resolves.toEqual({ ok: true, notifications: 2 });
  });

  it("fails loudly when a Stream message arrives for an unmapped channel", async () => {
    mockGetStreamChatThreadNotificationContext.mockResolvedValue(null);
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/stream/webhook", {
        method: "POST",
        headers: { "x-signature": "signature" },
        body: JSON.stringify({
          type: "message.new",
          cid: "messaging:unknown",
          message: {
            id: "stream-message-1",
            text: "Hello",
            user: { id: "sender-1" },
          },
        }),
      }),
    );

    expect(response.status).toBe(500);
    expect(mockCreateStreamMessageNotifications).not.toHaveBeenCalled();
  });

  it("ignores non-message events", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/stream/webhook", {
        method: "POST",
        headers: { "x-signature": "signature" },
        body: JSON.stringify({ type: "notification.mark_read" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockCreateStreamMessageNotifications).not.toHaveBeenCalled();
  });
});
