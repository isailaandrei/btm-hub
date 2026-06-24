import { createHash } from "node:crypto";
import type {
  EmailProvider,
  NormalizedProviderEvent,
  NormalizedProviderEventType,
  ProviderSendEmailInput,
  ProviderSendEmailResult,
} from "./types";

const BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email";

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readScalarString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function normalizeBrevoMessageId(value: unknown): string | null {
  const messageId = readString(value);
  if (!messageId) return null;
  const normalized = messageId.replace(/^<+/, "").replace(/>+$/, "").trim();
  return normalized || null;
}

function timestampToIso(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value * 1000).toISOString();
  }
  return new Date().toISOString();
}

function mapBrevoEvent(event: string): NormalizedProviderEventType | null {
  switch (event) {
    case "request":
      return "sent";
    case "delivered":
      return "delivered";
    case "deferred":
    case "soft_bounce":
      // Temporary failures: Brevo retries these automatically (greylisting,
      // mailbox-full, throttling). Transient, not terminal — a later "delivered"
      // overrides the resulting "deferred" recipient status.
      return "delivery_delayed";
    case "opened":
    case "unique_opened":
      return "opened";
    case "click":
      return "clicked";
    case "hard_bounce":
    case "invalid_email":
      return "bounced";
    case "blocked":
    case "error":
      return "failed";
    case "spam":
      return "complained";
    case "unsubscribed":
      return "unsubscribed";
    default:
      return null;
  }
}

function buildBrevoProviderEventId(input: {
  eventPayload: Record<string, unknown>;
  providerMessageId: string | null;
  rawEvent: string;
}): string {
  const identity = {
    event: input.rawEvent,
    messageId: input.providerMessageId,
    email: readString(input.eventPayload.email),
    tsEvent: readScalarString(input.eventPayload.ts_event),
    ts: readScalarString(input.eventPayload.ts),
    tsEpoch: readScalarString(input.eventPayload.ts_epoch),
    link: readString(input.eventPayload.link),
    reason: readString(input.eventPayload.reason),
    webhookId: readScalarString(input.eventPayload.id),
  };
  const hash = createHash("sha256")
    .update(JSON.stringify(identity))
    .digest("hex");
  return `${input.rawEvent}:${hash}`;
}

export function createBrevoEmailProvider(
  apiKey = process.env.BREVO_API_KEY?.trim(),
): EmailProvider {
  if (!apiKey) throw new Error("Missing BREVO_API_KEY");

  return {
    name: "brevo",
    async sendEmail(
      input: ProviderSendEmailInput,
    ): Promise<ProviderSendEmailResult> {
      const response = await fetch(BREVO_SEND_URL, {
        method: "POST",
        headers: {
          accept: "application/json",
          "api-key": apiKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sender: {
            email: input.fromEmail,
            name: input.fromName,
          },
          to: [{ email: input.to }],
          replyTo: { email: input.replyTo },
          subject: input.subject,
          htmlContent: input.html,
          textContent: input.text,
          headers: {
            idempotencyKey: input.recipientId,
            "X-Mailin-custom": JSON.stringify(input.metadata),
            ...input.headers,
          },
          tags: ["btm-admin-email", input.sendId],
        }),
      });

      const raw = (await response.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      if (!response.ok) {
        throw new Error(
          `Brevo send failed (${response.status} ${response.statusText}): ${
            readString(raw.message) ?? response.statusText
          }`,
        );
      }

      return {
        provider: "brevo",
        providerMessageId:
          normalizeBrevoMessageId(raw.messageId) ??
          normalizeBrevoMessageId(raw["message-id"]) ??
          `brevo-${input.recipientId}`,
        raw,
      };
    },
    parseWebhook(payload: unknown): NormalizedProviderEvent[] {
      const events = Array.isArray(payload) ? payload : [payload];
      return events.flatMap((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return [];
        const eventPayload = item as Record<string, unknown>;
        const rawEvent = readString(eventPayload.event);
        if (!rawEvent) return [];
        const type = mapBrevoEvent(rawEvent);
        if (!type) return [];
        const providerMessageId = normalizeBrevoMessageId(
          eventPayload["message-id"],
        );
        const providerEventId = buildBrevoProviderEventId({
          eventPayload,
          providerMessageId,
          rawEvent,
        });

        return [
          {
            type,
            provider: "brevo",
            providerEventId,
            providerMessageId,
            occurredAt: timestampToIso(
              eventPayload.ts_event ?? eventPayload.ts,
            ),
            rawEvent,
            payload: eventPayload,
          },
        ];
      });
    },
  };
}
