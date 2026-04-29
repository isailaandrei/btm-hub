import type { EmailEventType } from "@/types/database";
import type {
  EmailProvider,
  ForwardInboundReplyInput,
  ProviderSendEmailInput,
  ProviderSendEmailResult,
  ProviderWebhookResult,
} from "./types";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

async function sendFakeEmail(
  input: ProviderSendEmailInput,
): Promise<ProviderSendEmailResult> {
  return {
    provider: "fake",
    providerMessageId: `fake-${input.recipientId}`,
    raw: { accepted: true },
  };
}

export function createFakeEmailProvider(): EmailProvider {
  return {
    name: "fake",
    sendEmail: sendFakeEmail,
    async sendBatch(inputs: ProviderSendEmailInput[]) {
      return Promise.all(inputs.map((input) => sendFakeEmail(input)));
    },
    async parseWebhook(payload: unknown): Promise<ProviderWebhookResult> {
      const record = asRecord(payload);
      if (stringField(record, "type") === "email.received") {
        return {
          kind: "reply",
          reply: {
            provider: "fake",
            providerEventId: stringField(record, "id"),
            providerMessageId: stringField(record, "messageId") || null,
            inboundTo: stringField(record, "to"),
            inboundFrom: stringField(record, "from"),
            subject: stringField(record, "subject"),
            textBody: stringField(record, "text"),
            htmlBody: stringField(record, "html"),
            attachmentMetadata: [],
            receivedAt: stringField(record, "occurredAt"),
            payload: record,
          },
        };
      }

      const eventMap: Record<string, EmailEventType> = {
        "email.sent": "sent",
        "email.delivered": "delivered",
        "email.delivery_delayed": "delivery_delayed",
        "email.opened": "opened",
        "email.clicked": "clicked",
        "email.bounced": "bounced",
        "email.complained": "complained",
        "email.failed": "failed",
        "email.unsubscribed": "unsubscribed",
      };

      const eventType = eventMap[stringField(record, "type")] ?? "failed";
      return {
        kind: "event",
        event: {
          type: eventType,
          provider: "fake",
          providerEventId: stringField(record, "id"),
          providerMessageId: stringField(record, "messageId") || null,
          occurredAt: stringField(record, "occurredAt") || new Date().toISOString(),
          payload: record,
        },
      };
    },
    async verifyWebhookSignature() {
      return true;
    },
    async forwardInboundReply(
      input: ForwardInboundReplyInput,
    ): Promise<ProviderSendEmailResult> {
      return {
        provider: "fake",
        providerMessageId: `fake-forward-${input.replyId}`,
        raw: { forwarded: true },
      };
    },
  };
}
