import { describe, expect, it } from "vitest";
import {
  getNotificationHref,
  getNotificationText,
} from "./notifications";

describe("notification helpers", () => {
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
