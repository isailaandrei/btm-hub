import type {
  ConversationIngestAdapter,
  NormalizedConversationMessage,
} from "./adapter";

/**
 * Media keys that may appear on a YCloud inbound WhatsApp message. Each holds an
 * object shaped like `{ id, link, caption, mime_type, filename, sha256 }`.
 * See https://docs.ycloud.com/reference/whatsapp-inbound-message-webhook-examples
 */
const MEDIA_KEYS = ["image", "video", "audio", "document", "sticker"] as const;

type NormalizedMedia = {
  url: string;
  contentType: string | null;
  caption: string | null;
};

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    throw new Error(`YCloud webhook ${label} is missing or not an object`);
  }
  return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function requiredString(value: unknown, field: string): string {
  const parsed = nonEmptyString(value);
  if (!parsed) throw new Error(`YCloud inbound message missing ${field}`);
  return parsed;
}

function collectMedia(message: Record<string, unknown>): NormalizedMedia[] {
  const media: NormalizedMedia[] = [];
  for (const key of MEDIA_KEYS) {
    const raw = message[key];
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const url = nonEmptyString(item.link);
    if (!url) continue;
    media.push({
      url,
      contentType: nonEmptyString(item.mime_type),
      caption: nonEmptyString(item.caption),
    });
  }
  return media;
}

function extractBody(
  message: Record<string, unknown>,
  media: NormalizedMedia[],
): string {
  const text = message.text;
  if (text && typeof text === "object") {
    const body = (text as Record<string, unknown>).body;
    if (typeof body === "string") return body;
  }
  return media.find((item) => item.caption)?.caption ?? "";
}

/**
 * Normalizes a YCloud `whatsapp.inbound_message.received` event into a
 * source-agnostic conversation message. The caller is responsible for verifying
 * the webhook signature and for filtering to inbound events before calling this.
 */
export class YCloudWhatsAppAdapter implements ConversationIngestAdapter {
  parse(event: unknown): NormalizedConversationMessage {
    const root = asRecord(event, "payload");
    const message = asRecord(root.whatsappInboundMessage, "whatsappInboundMessage");

    const providerMessageId =
      nonEmptyString(message.id) ?? nonEmptyString(message.wamid);
    if (!providerMessageId) {
      throw new Error("YCloud inbound message missing id/wamid");
    }

    const media = collectMedia(message);

    return {
      source: "whatsapp",
      provider: "ycloud",
      providerMessageId,
      direction: "inbound",
      fromIdentifier: requiredString(message.from, "from"),
      toIdentifier: requiredString(message.to, "to"),
      body: extractBody(message, media),
      media: media.map((item) => ({
        url: item.url,
        contentType: item.contentType,
      })),
      happenedAt: nonEmptyString(message.sendTime) ?? new Date().toISOString(),
      rawPayload: root,
    };
  }
}
