import { describe, expect, it } from "vitest";
import {
  buildDmMessageNotification,
  getNotificationHref,
  getNotificationText,
} from "./notifications";

describe("notification helpers", () => {
  it("builds a DM notification for the other conversation participant", () => {
    expect(
      buildDmMessageNotification({
        conversation: {
          id: "conversation-1",
          user1_id: "sender-1",
          user2_id: "recipient-1",
        },
        senderId: "sender-1",
        messageId: "message-1",
        bodyPreview: "Hello from the app",
      }),
    ).toEqual({
      recipient_id: "recipient-1",
      actor_id: "sender-1",
      type: "dm_message",
      entity_type: "dm_message",
      entity_id: "message-1",
      metadata: {
        conversation_id: "conversation-1",
        body_preview: "Hello from the app",
      },
    });
  });

  it("does not build a DM notification when the sender is not in the conversation", () => {
    expect(
      buildDmMessageNotification({
        conversation: {
          id: "conversation-1",
          user1_id: "user-1",
          user2_id: "user-2",
        },
        senderId: "user-3",
        messageId: "message-1",
        bodyPreview: "Hello",
      }),
    ).toBeNull();
  });

  it("formats notification text and href for DM messages", () => {
    const notification = {
      id: "notification-1",
      recipient_id: "recipient-1",
      actor_id: "sender-1",
      type: "dm_message" as const,
      entity_type: "dm_message" as const,
      entity_id: "message-1",
      metadata: {
        conversation_id: "conversation-1",
        body_preview: "A short private message",
      },
      read_at: null,
      created_at: "2026-05-08T10:00:00.000Z",
      actor: { id: "sender-1", display_name: "Aisha Patel", avatar_url: null },
    };

    expect(getNotificationText(notification)).toBe(
      "Aisha Patel sent you a message: A short private message",
    );
    expect(getNotificationHref(notification)).toBe(
      "/community/messages/conversation-1",
    );
  });

  it("formats notification text and href for Stream messages", () => {
    const notification = {
      id: "notification-1",
      recipient_id: "recipient-1",
      actor_id: "sender-1",
      type: "stream_message" as const,
      entity_type: "stream_message" as const,
      entity_id: "00000000-0000-4000-8000-000000000001",
      metadata: {
        thread_id: "00000000-0000-4000-8000-000000000099",
        stream_channel_cid: "messaging:channel-1",
        stream_message_id: "stream-message-1",
        body_preview: "A short Stream message",
      },
      read_at: null,
      created_at: "2026-05-08T10:00:00.000Z",
      actor: { id: "sender-1", display_name: "Aisha Patel", avatar_url: null },
    };

    expect(getNotificationText(notification)).toBe(
      "Aisha Patel sent you a message: A short Stream message",
    );
    expect(getNotificationHref(notification)).toBe(
      "/community/messages?thread=00000000-0000-4000-8000-000000000099",
    );
  });

  it("does not expose raw Stream CIDs in notification hrefs", () => {
    const notification = {
      id: "notification-1",
      recipient_id: "recipient-1",
      actor_id: "sender-1",
      type: "stream_message" as const,
      entity_type: "stream_message" as const,
      entity_id: "00000000-0000-4000-8000-000000000001",
      metadata: {
        stream_channel_cid: "messaging:channel-1",
        stream_message_id: "stream-message-1",
        body_preview: "A short Stream message",
      },
      read_at: null,
      created_at: "2026-05-08T10:00:00.000Z",
      actor: { id: "sender-1", display_name: "Aisha Patel", avatar_url: null },
    };

    expect(getNotificationHref(notification)).toBe("/profile/notifications");
  });
});
