import type { EmailEventType } from "@/types/database";

export interface ProviderSendEmailInput {
  recipientId: string;
  to: string;
  from: string;
  replyTo: string;
  subject: string;
  html: string;
  text: string;
  metadata: Record<string, string>;
}

export interface ProviderSendEmailResult {
  provider: string;
  providerMessageId: string;
  raw: Record<string, unknown>;
}

export interface NormalizedProviderEvent {
  type: EmailEventType;
  provider: string;
  providerEventId: string;
  providerMessageId: string | null;
  occurredAt: string;
  payload: Record<string, unknown>;
}

export interface NormalizedInboundReply {
  provider: string;
  providerEventId: string;
  providerMessageId: string | null;
  inboundTo: string;
  inboundFrom: string;
  subject: string;
  textBody: string;
  htmlBody: string;
  attachmentMetadata: Record<string, unknown>[];
  receivedAt: string;
  payload: Record<string, unknown>;
}

export type ProviderWebhookResult =
  | { kind: "event"; event: NormalizedProviderEvent }
  | { kind: "reply"; reply: NormalizedInboundReply };

export interface ForwardInboundReplyInput {
  replyId: string;
  to: string;
  from: string;
  subject: string;
  textBody: string;
  htmlBody: string;
  attachmentMetadata: Record<string, unknown>[];
}

export interface EmailProvider {
  name: string;
  sendEmail(input: ProviderSendEmailInput): Promise<ProviderSendEmailResult>;
  sendBatch(inputs: ProviderSendEmailInput[]): Promise<ProviderSendEmailResult[]>;
  parseWebhook(payload: unknown): Promise<ProviderWebhookResult>;
  verifyWebhookSignature(rawBody: string, headers: Headers): Promise<boolean>;
  forwardInboundReply(input: ForwardInboundReplyInput): Promise<ProviderSendEmailResult>;
}
