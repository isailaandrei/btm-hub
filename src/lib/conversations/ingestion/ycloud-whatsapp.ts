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
 * Extracts WhatsApp's canonical, perspective-independent message id from a
 * `wamid`, so ingestion can dedupe on a stable identity.
 *
 * A wamid is `wamid.` + base64 of a small binary envelope shaped like:
 *
 *   0x1c 0x18 <phoneLen> <peer phone, ASCII digits>
 *   0x15 0x02 0x00 <dir> 0x18 <idLen> <message id, ASCII hex> [0x00]
 *
 * The embedded *peer phone* is NOT stable for a given message: the live
 * send-echo (`whatsapp.smb.message.echoes`) encodes the customer while the
 * history-sync copy (`whatsapp.smb.history`) encodes the business number — so
 * the same outbound message arrives under two different full wamids. The
 * trailing, length-prefixed ASCII-hex *message id* is identical across the live
 * inbound event, the echo, and every history re-sync, so that is the identity
 * we key on. (YCloud's own `id` field is an ephemeral per-delivery surrogate and
 * must never be used — it defeats the `(provider, provider_message_id)` unique
 * constraint, which is what let duplicates accumulate.)
 *
 * The decoded envelope contains exactly two runs of ASCII-hex characters — the
 * peer phone, then the message id — fenced apart by the non-hex control bytes
 * of the `0x15 0x02 0x00 … 0x18` marker, so the final hex run is the message id.
 *
 * Returns `null` when the envelope doesn't match this shape; the caller then
 * falls back to the full wamid, so a future wamid-format change degrades to
 * "dedupe by wamid" rather than crashing or silently over-merging messages.
 */
export function whatsappMessageIdFromWamid(wamid: string): string | null {
  if (!wamid.startsWith("wamid.")) return null;
  const decoded = Buffer.from(wamid.slice("wamid.".length), "base64").toString(
    "latin1",
  );
  const runs = decoded.match(/[0-9A-Fa-f]{8,}/g);
  return runs ? runs[runs.length - 1].toUpperCase() : null;
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
  // Dedupe identity: the stable message id derived from the wamid, falling back
  // to the full wamid, and only as a last resort to YCloud's ephemeral `id`
  // (which changes on every re-delivery — never a reliable key). See
  // whatsappMessageIdFromWamid.
  const wamid = nonEmptyString(message.wamid);
  const providerMessageId =
    (wamid ? whatsappMessageIdFromWamid(wamid) : null) ??
    wamid ??
    nonEmptyString(message.id);
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

/**
 * Parses a `whatsapp.smb.message.echoes` event. In Coexistence mode the business
 * sends from the WhatsApp Business App / a linked device, and Meta echoes that
 * outbound message to the Cloud API. YCloud delivers the content under
 * `whatsappMessage` (business -> customer) — the same shape as an outbound
 * history message — so these are always outbound.
 */
export function parseYCloudEchoEvent(
  event: unknown,
): NormalizedConversationMessage {
  const root = asRecord(event, "payload");
  const message = asRecord(root.whatsappMessage, "whatsappMessage");
  return normalizeMessageObject(message, "outbound", root);
}
