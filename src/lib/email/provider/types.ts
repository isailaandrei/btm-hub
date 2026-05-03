export interface ProviderSendEmailInput {
  recipientId: string;
  sendId: string;
  contactId: string | null;
  to: string;
  fromEmail: string;
  fromName: string;
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

export type NormalizedProviderEventType =
  | "sent"
  | "delivered"
  | "delivery_delayed"
  | "opened"
  | "clicked"
  | "bounced"
  | "complained"
  | "failed"
  | "unsubscribed";

export interface NormalizedProviderEvent {
  type: NormalizedProviderEventType;
  provider: string;
  providerEventId: string | null;
  providerMessageId: string | null;
  occurredAt: string;
  rawEvent: string | null;
  payload: Record<string, unknown>;
}

export interface EmailProvider {
  name: string;
  sendEmail(input: ProviderSendEmailInput): Promise<ProviderSendEmailResult>;
  parseWebhook(payload: unknown): NormalizedProviderEvent[];
}
