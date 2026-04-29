import { Models, ServerClient } from "postmark";
import type { EmailEventType } from "@/types/database";
import type {
  EmailProvider,
  ForwardInboundReplyInput,
  NormalizedInboundReply,
  NormalizedProviderEvent,
  ProviderSendEmailInput,
  ProviderSendEmailResult,
  ProviderWebhookResult,
} from "./types";

const POSTMARK_PROVIDER = "postmark";
const DEFAULT_BROADCAST_STREAM = "broadcast";
const DEFAULT_TRANSACTIONAL_STREAM = "outbound";
const DEFAULT_FORWARD_FROM = "BTM Replies <noreply@mail.behind-the-mask.com>";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function numericField(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === "number" ? value : null;
}

function getPostmarkClient() {
  const token = process.env.POSTMARK_SERVER_TOKEN?.trim();
  if (!token) throw new Error("Missing POSTMARK_SERVER_TOKEN");
  return new ServerClient(token);
}

function trimEnv(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

function resolveMessageStream(input: ProviderSendEmailInput): string {
  if (input.metadata.campaignKind === "broadcast") {
    return trimEnv("POSTMARK_BROADCAST_MESSAGE_STREAM", DEFAULT_BROADCAST_STREAM);
  }

  return trimEnv(
    "POSTMARK_TRANSACTIONAL_MESSAGE_STREAM",
    DEFAULT_TRANSACTIONAL_STREAM,
  );
}

function toPostmarkMessage(input: ProviderSendEmailInput) {
  return {
    From: input.from,
    To: input.to,
    ReplyTo: input.replyTo,
    Subject: input.subject,
    HtmlBody: input.html,
    TextBody: input.text,
    MessageStream: resolveMessageStream(input),
    Metadata: input.metadata,
    TrackOpens: true,
    TrackLinks: Models.LinkTrackingOptions.HtmlAndText,
  };
}

function toPostmarkSendResult(response: unknown): ProviderSendEmailResult {
  const record = asRecord(response);
  return {
    provider: POSTMARK_PROVIDER,
    providerMessageId: stringField(record, "MessageID"),
    raw: record,
  };
}

function toEventId(
  record: Record<string, unknown>,
  recordType: string,
  messageId: string,
  occurredAt: string,
): string {
  const providerId = stringField(record, "ID");
  if (providerId) return providerId;

  const link = stringField(record, "OriginalLink");
  return [recordType, messageId, occurredAt, link].filter(Boolean).join(":");
}

function firstTimestamp(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = stringField(record, key);
    if (value) return value;
  }

  return new Date().toISOString();
}

function parseMailbox(value: string): string {
  const angleMatch = value.match(/<([^>]+)>/);
  return (angleMatch?.[1] ?? value).trim();
}

function firstAddressFromArray(value: unknown): string {
  if (!Array.isArray(value)) return "";
  const first = asRecord(value[0]);
  return stringField(first, "Email");
}

function inboundToAddress(record: Record<string, unknown>): string {
  const originalRecipient = stringField(record, "OriginalRecipient");
  if (originalRecipient) return parseMailbox(originalRecipient);

  const toFullAddress = firstAddressFromArray(record.ToFull);
  if (toFullAddress) return parseMailbox(toFullAddress);

  return parseMailbox(stringField(record, "To"));
}

function inboundFromAddress(record: Record<string, unknown>): string {
  const fromFull = asRecord(record.FromFull);
  const fromFullAddress = stringField(fromFull, "Email");
  if (fromFullAddress) return parseMailbox(fromFullAddress);

  return parseMailbox(stringField(record, "From"));
}

function attachmentMetadata(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];

  return value.map((attachment) => {
    const record = asRecord(attachment);
    const contentLength = numericField(record, "ContentLength");
    return {
      name: stringField(record, "Name"),
      contentType: stringField(record, "ContentType"),
      ...(contentLength == null ? {} : { contentLength }),
    };
  });
}

function normalizeInboundReply(record: Record<string, unknown>): ProviderWebhookResult {
  const messageId = stringField(record, "MessageID");
  const receivedAt = firstTimestamp(record, ["Date", "ReceivedAt"]);
  const textBody =
    stringField(record, "StrippedTextReply") || stringField(record, "TextBody");

  const reply: NormalizedInboundReply = {
    provider: POSTMARK_PROVIDER,
    providerEventId: messageId || toEventId(record, "Inbound", messageId, receivedAt),
    providerMessageId: messageId || null,
    inboundTo: inboundToAddress(record),
    inboundFrom: inboundFromAddress(record),
    subject: stringField(record, "Subject"),
    textBody,
    htmlBody: stringField(record, "HtmlBody"),
    attachmentMetadata: attachmentMetadata(record.Attachments),
    receivedAt,
    payload: record,
  };

  return { kind: "reply", reply };
}

function normalizeEvent(record: Record<string, unknown>): ProviderWebhookResult {
  const recordType = stringField(record, "RecordType");
  const messageId = stringField(record, "MessageID");
  const eventMap: Record<string, EmailEventType> = {
    Delivery: "delivered",
    Open: "opened",
    Click: "clicked",
    Bounce: "bounced",
    SpamComplaint: "complained",
  };
  const type = eventMap[recordType];

  if (!type) {
    throw new Error(`Unsupported Postmark webhook record type: ${recordType}`);
  }

  const occurredAt = firstTimestamp(record, [
    "DeliveredAt",
    "ReceivedAt",
    "BouncedAt",
    "Date",
  ]);
  const event: NormalizedProviderEvent = {
    type,
    provider: POSTMARK_PROVIDER,
    providerEventId: toEventId(record, recordType, messageId, occurredAt),
    providerMessageId: messageId || null,
    occurredAt,
    payload: record,
  };

  return { kind: "event", event };
}

export async function normalizePostmarkWebhook(
  payload: unknown,
): Promise<ProviderWebhookResult> {
  const record = asRecord(payload);
  const recordType = stringField(record, "RecordType");

  if (
    recordType === "Inbound" ||
    stringField(record, "MessageStream") === "inbound" ||
    (!recordType && stringField(record, "From") && stringField(record, "To"))
  ) {
    return normalizeInboundReply(record);
  }

  return normalizeEvent(record);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function basicAuthMatches(headers: Headers, username: string, password: string): boolean {
  const authorization = headers.get("authorization");
  if (!authorization?.startsWith("Basic ")) return false;

  const encoded = authorization.slice("Basic ".length);
  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  return decoded === `${username}:${password}`;
}

async function verifyPostmarkWebhook(headers: Headers): Promise<boolean> {
  const token = process.env.POSTMARK_WEBHOOK_TOKEN?.trim();
  if (token) {
    const provided =
      headers.get("x-postmark-webhook-token") ?? headers.get("x-webhook-token");
    return provided === token;
  }

  const username = process.env.POSTMARK_WEBHOOK_BASIC_AUTH_USER?.trim();
  const password = process.env.POSTMARK_WEBHOOK_BASIC_AUTH_PASSWORD?.trim();
  if (username || password) {
    return basicAuthMatches(headers, username ?? "", password ?? "");
  }

  return false;
}

export function createPostmarkEmailProvider(): EmailProvider {
  const provider: EmailProvider = {
    name: POSTMARK_PROVIDER,
    async sendEmail(input: ProviderSendEmailInput): Promise<ProviderSendEmailResult> {
      const response = await getPostmarkClient().sendEmail(toPostmarkMessage(input));

      return toPostmarkSendResult(response);
    },
    async sendBatch(inputs: ProviderSendEmailInput[]) {
      if (inputs.length === 0) return [];
      const responses = await getPostmarkClient().sendEmailBatch(
        inputs.map((input) => toPostmarkMessage(input)),
      );
      return responses.map((response) => toPostmarkSendResult(response));
    },
    async parseWebhook(payload: unknown): Promise<ProviderWebhookResult> {
      return normalizePostmarkWebhook(payload);
    },
    async verifyWebhookSignature(_rawBody: string, headers: Headers) {
      return verifyPostmarkWebhook(headers);
    },
    async forwardInboundReply(
      input: ForwardInboundReplyInput,
    ): Promise<ProviderSendEmailResult> {
      const htmlBody = input.htmlBody || `<pre>${escapeHtml(input.textBody)}</pre>`;
      const response = await getPostmarkClient().sendEmail({
        From: trimEnv("POSTMARK_FORWARD_FROM", DEFAULT_FORWARD_FROM),
        To: input.to,
        ReplyTo: input.from,
        Subject: input.subject,
        HtmlBody: htmlBody,
        TextBody: input.textBody,
        MessageStream: trimEnv(
          "POSTMARK_TRANSACTIONAL_MESSAGE_STREAM",
          DEFAULT_TRANSACTIONAL_STREAM,
        ),
        Metadata: { replyId: input.replyId },
      });

      return toPostmarkSendResult(response);
    },
  };

  return provider;
}
