import { sanitizeBody } from "@/lib/community/sanitize";
import type { NotificationWithActor } from "@/types/database";

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
  if (notification.type === "stream_message") {
    const actorName = notification.actor?.display_name?.trim() || "Someone";
    const preview = notification.metadata.body_preview;
    if (typeof preview === "string" && preview.trim()) {
      return `${actorName} sent you a message: ${preview.trim()}`;
    }
    return `${actorName} sent you a message`;
  }

  return "You have a new notification";
}
