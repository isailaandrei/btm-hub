import { beforeEach, describe, expect, it, vi } from "vitest";

const mockInsert = vi.fn();
const mockEq = vi.fn();
const mockIs = vi.fn();
const mockUpdate = vi.fn();
const mockCreateAdminClient = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mockCreateAdminClient,
}));

describe("stream notification data helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // insert(...) is bounded by .abortSignal(...) in createStreamMessageNotifications,
    // so the insert mock must return a chainable whose .abortSignal resolves.
    mockInsert.mockReturnValue({
      abortSignal: vi.fn().mockResolvedValue({ error: null }),
    });
    mockIs.mockResolvedValue({ error: null });
    mockEq.mockReturnValue({ eq: mockEq, is: mockIs });
    mockUpdate.mockReturnValue({ eq: mockEq });
    mockCreateAdminClient.mockResolvedValue({
      from: vi.fn(() => ({
        insert: mockInsert,
        update: mockUpdate,
      })),
    });
  });

  it("creates minimal Stream message notifications through one admin insert", async () => {
    const { createStreamMessageNotifications } = await import("./stream-notifications");

    await createStreamMessageNotifications({
      threadId: "00000000-0000-4000-8000-000000000099",
      recipientIds: ["recipient-1", "recipient-2", "recipient-1"],
      actorId: "sender-1",
      streamMessageId: "message-1",
      streamChannelCid: "messaging:channel-1",
      streamChannelId: "channel-1",
      bodyPreview: "Hello from Stream",
    });

    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        recipient_id: "recipient-1",
        actor_id: "sender-1",
        type: "stream_message",
        entity_type: "stream_message",
        entity_id: "00000000-0000-4000-8000-000000000099",
        metadata: {
          thread_id: "00000000-0000-4000-8000-000000000099",
          stream_message_id: "message-1",
          stream_channel_cid: "messaging:channel-1",
          stream_channel_id: "channel-1",
          body_preview: "Hello from Stream",
        },
      }),
      expect.objectContaining({
        recipient_id: "recipient-2",
        entity_id: "00000000-0000-4000-8000-000000000099",
      }),
    ]);
  });

  it("treats duplicate Stream message notifications as already handled", async () => {
    mockInsert.mockReturnValue({
      abortSignal: vi.fn().mockResolvedValue({
        error: { code: "23505", message: "duplicate key" },
      }),
    });
    const { createStreamMessageNotifications } = await import("./stream-notifications");

    await expect(
      createStreamMessageNotifications({
        threadId: "00000000-0000-4000-8000-000000000099",
        recipientIds: ["recipient-1"],
        actorId: "sender-1",
        streamMessageId: "message-1",
        streamChannelCid: "messaging:channel-1",
        streamChannelId: "channel-1",
        bodyPreview: "Hello from Stream",
      }),
    ).resolves.toBeUndefined();
  });

  it("marks unread Stream notifications for an app thread as read", async () => {
    const { markStreamThreadNotificationsRead } = await import("./stream-notifications");

    await markStreamThreadNotificationsRead({
      recipientId: "recipient-1",
      threadId: "00000000-0000-4000-8000-000000000099",
    });

    expect(mockUpdate).toHaveBeenCalledWith({ read_at: expect.any(String) });
    expect(mockEq).toHaveBeenCalledWith("recipient_id", "recipient-1");
    expect(mockEq).toHaveBeenCalledWith("type", "stream_message");
    expect(mockEq).toHaveBeenCalledWith(
      "metadata->>thread_id",
      "00000000-0000-4000-8000-000000000099",
    );
    expect(mockIs).toHaveBeenCalledWith("read_at", null);
  });
});
