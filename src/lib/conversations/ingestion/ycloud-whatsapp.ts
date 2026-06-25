import type {
  ConversationDirection,
  ConversationIngestAdapter,
  NormalizedConversationMessage,
} from "./adapter";

/**
 * Media keys that may appear on a YCloud WhatsApp message. Each holds an object
 * shaped like `{ id, link, caption, mime_type, filename, sha256 }`.
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
  if (!parsed) throw new Error(`YCloud message missing ${field}`);
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
 * Normalizes a single YCloud message object (the contents of
 * `whatsappInboundMessage` or `whatsappMessage`) into a source-agnostic message.
 * `from`/`to` are stored as sent: for inbound `from` is the customer, for
 * outbound `from` is the business number.
 */
function normalizeMessageObject(
  message: Record<string, unknown>,
  direction: ConversationDirection,
  rawPayload: Record<string, unknown>,
): NormalizedConversationMessage {
  const providerMessageId =
    nonEmptyString(message.id) ?? nonEmptyString(message.wamid);
  if (!providerMessageId) {
    throw new Error("YCloud message missing id/wamid");
  }

  const media = collectMedia(message);

  return {
    source: "whatsapp",
    provider: "ycloud",
    providerMessageId,
    direction,
    fromIdentifier: requiredString(message.from, "from"),
    toIdentifier: requiredString(message.to, "to"),
    body: extractBody(message, media),
    media: media.map((item) => ({
      url: item.url,
      contentType: item.contentType,
    })),
    happenedAt: nonEmptyString(message.sendTime) ?? new Date().toISOString(),
    rawPayload,
  };
}

/**
 * Normalizes a YCloud `whatsapp.inbound_message.received` event. The caller is
 * responsible for verifying the webhook signature and filtering to inbound
 * events before calling this.
 */
export class YCloudWhatsAppAdapter implements ConversationIngestAdapter {
  parse(event: unknown): NormalizedConversationMessage {
    const root = asRecord(event, "payload");
    const message = asRecord(
      root.whatsappInboundMessage,
      "whatsappInboundMessage",
    );
    return normalizeMessageObject(message, "inbound", root);
  }
}

/**
 * Parses a single `whatsapp.smb.history` event (WhatsApp Business App / Coexistence
 * history sync). Each event carries either `whatsappInboundMessage` (customer →
 * business) or `whatsappMessage` (business → customer); direction is inferred
 * from which key is present.
 */
export function parseYCloudHistoryEvent(
  event: unknown,
): NormalizedConversationMessage {
  const root = asRecord(event, "payload");

  if (root.whatsappInboundMessage && typeof root.whatsappInboundMessage === "object") {
    return normalizeMessageObject(
      root.whatsappInboundMessage as Record<string, unknown>,
      "inbound",
      root,
    );
  }

  if (root.whatsappMessage && typeof root.whatsappMessage === "object") {
    return normalizeMessageObject(
      root.whatsappMessage as Record<string, unknown>,
      "outbound",
      root,
    );
  }

  throw new Error(
    "YCloud history event missing whatsappInboundMessage/whatsappMessage",
  );
}
