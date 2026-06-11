import type {
  ConversationIngestAdapter,
  NormalizedConversationMessage,
} from "./adapter";

function required(payload: URLSearchParams, key: string): string {
  const value = payload.get(key)?.trim();
  if (!value) throw new Error(`Twilio WhatsApp payload missing ${key}`);
  return value;
}

function stripWhatsAppPrefix(value: string): string {
  return value.replace(/^whatsapp:/i, "").trim();
}

function rawPayloadObject(payload: URLSearchParams): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of payload.entries()) out[key] = value;
  return out;
}

function parseMedia(payload: URLSearchParams): NormalizedConversationMessage["media"] {
  const count = Number.parseInt(payload.get("NumMedia") ?? "0", 10);
  if (!Number.isFinite(count) || count <= 0) return [];
  const media: NormalizedConversationMessage["media"] = [];
  for (let index = 0; index < count; index += 1) {
    const url = payload.get(`MediaUrl${index}`)?.trim();
    if (!url) continue;
    media.push({
      url,
      contentType: payload.get(`MediaContentType${index}`)?.trim() || null,
    });
  }
  return media;
}

export class TwilioWhatsAppAdapter implements ConversationIngestAdapter {
  parse(payload: URLSearchParams): NormalizedConversationMessage {
    return {
      source: "whatsapp",
      provider: "twilio",
      providerMessageId: required(payload, "MessageSid"),
      direction: "inbound",
      fromIdentifier: stripWhatsAppPrefix(required(payload, "From")),
      toIdentifier: stripWhatsAppPrefix(required(payload, "To")),
      body: payload.get("Body") ?? "",
      media: parseMedia(payload),
      happenedAt: new Date().toISOString(),
      rawPayload: rawPayloadObject(payload),
    };
  }
}
