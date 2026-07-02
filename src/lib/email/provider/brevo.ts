import { createHash } from "node:crypto";
import type {
  EmailProvider,
  NormalizedProviderEvent,
  NormalizedProviderEventType,
  ProviderSendEmailInput,
  ProviderSendEmailResult,
} from "./types";

const BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email";
// Bound the send so a hung Brevo API call can't hold a worker instance (and its
// resources) open indefinitely. See the CLAUDE.md storm-proofing invariant.
const BREVO_SEND_TIMEOUT_MS = 15000;

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
    case "proxy_open":
    case "unique_proxy_open":
      // "Loaded by proxy" — a privacy proxy (chiefly Apple Mail Privacy
      // Protection) pre-fetched the tracking pixel. Not a confirmed human open;
      // tracked separately so it never inflates the real open count.
      return "proxy_opened";
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
      // Defensive catch-all for proxy opens. The exact webhook payload string is
      // only observable in production; the two cases above are the documented
      // literals, but no legitimate Brevo event name other than a proxy open
      // contains "proxy", so this prevents a silent regression to "dropped" if
      // the literal ever differs from what we expect.
      if (event.includes("proxy")) return "proxy_opened";
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
            idempotencyKey: input.idempotencyKey ?? input.recipientId,
            "X-Mailin-custom": JSON.stringify(input.metadata),
            ...input.headers,
          },
          tags: ["btm-admin-email", input.sendId],
        }),
        signal: AbortSignal.timeout(BREVO_SEND_TIMEOUT_MS),
      }).catch((error: unknown): never => {
        // Fail loud with context so the send pipeline records the failure and
        // retries, rather than the recipient silently stalling on a hung request.
        throw new Error(
          `Brevo send request failed or timed out after ${BREVO_SEND_TIMEOUT_MS}ms: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
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
        if (!type) {
          // Fail loud, never swallow: surface unmapped Brevo events instead of
          // silently discarding them, so a new/renamed event type is noticed
          // (this is how proxy opens went unnoticed) rather than vanishing.
          console.warn(
            `[brevo-webhook] Unmapped Brevo event "${rawEvent}" — dropped (no metric updated)`,
          );
          return [];
        }
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
