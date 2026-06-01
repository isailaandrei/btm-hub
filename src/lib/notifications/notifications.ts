import { sanitizeBody } from "@/lib/community/sanitize";
import type {
  DmConversation,
  NotificationWithActor,
} from "@/types/database";

export interface NotificationInsert {
  recipient_id: string;
  actor_id: string | null;
  type: "dm_message" | "stream_message";
  entity_type: "dm_message" | "stream_message";
  entity_id: string;
  metadata: Record<string, string>;
}

interface DmMessageNotificationInput {
  conversation: Pick<DmConversation, "id" | "user1_id" | "user2_id">;
  senderId: string;
  messageId: string;
  bodyPreview: string;
}

export function buildDmMessageNotification({
  conversation,
  senderId,
  messageId,
  bodyPreview,
}: DmMessageNotificationInput): NotificationInsert | null {
  const recipientId =
    conversation.user1_id === senderId
      ? conversation.user2_id
      : conversation.user2_id === senderId
        ? conversation.user1_id
        : null;

  if (!recipientId || recipientId === senderId) return null;

  return {
    recipient_id: recipientId,
    actor_id: senderId,
    type: "dm_message",
    entity_type: "dm_message",
    entity_id: messageId,
    metadata: {
      conversation_id: conversation.id,
      body_preview: bodyPreview,
    },
  };
}

export function toNotificationPreview(
  body: string,
  bodyFormat: "text" | "html",
  maxLength = 140,
): string {
  const safeBody = bodyFormat === "html" ? sanitizeBody(body) : body;
  const text = safeBody
    .replace(/<img\b[^>]*>/gi, " image ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

export function getNotificationHref(notification: NotificationWithActor): string {
  if (notification.type === "dm_message") {
    const conversationId = notification.metadata.conversation_id;
    if (typeof conversationId === "string" && conversationId.length > 0) {
      return `/community/messages/${conversationId}`;
    }
  }

  if (notification.type === "stream_message") {
    const threadId = notification.metadata.thread_id;
    if (typeof threadId === "string" && threadId.length > 0) {
      return `/community/messages?thread=${encodeURIComponent(threadId)}`;
    }

    return "/profile/notifications";
  }

  return "/profile/notifications";
}

export function getNotificationText(notification: NotificationWithActor): string {
  if (notification.type === "dm_message" || notification.type === "stream_message") {
    const actorName = notification.actor?.display_name?.trim() || "Someone";
    const preview = notification.metadata.body_preview;
    if (typeof preview === "string" && preview.trim()) {
      return `${actorName} sent you a message: ${preview.trim()}`;
    }
    return `${actorName} sent you a message`;
  }

  return "You have a new notification";
}
