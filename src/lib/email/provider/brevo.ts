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
      return "delivery_delayed";
    case "opened":
    case "unique_opened":
    case "proxy_open":
    case "unique_proxy_open":
      return "opened";
    case "click":
      return "clicked";
    case "hard_bounce":
    case "invalid_email":
      return "bounced";
    case "soft_bounce":
    case "blocked":
      return "delivery_delayed";
    case "spam":
      return "complained";
    case "unsubscribed":
      return "unsubscribed";
    default:
      return null;
  }
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
            "X-Mailin-custom": JSON.stringify(input.metadata),
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
          readString(raw.messageId) ??
          readString(raw["message-id"]) ??
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
        const providerEventId = readString(eventPayload.id);
        const providerMessageId = readString(eventPayload["message-id"]);

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
