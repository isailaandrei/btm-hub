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
  /** Extra MIME headers (e.g. RFC-8058 List-Unsubscribe) for the provider. */
  headers?: Record<string, string>;
  /**
   * Idempotency key sent to the provider to suppress duplicate deliveries.
   * Defaults to the recipient id, but the send pipeline scopes it per attempt
   * (`<recipientId>:<send_attempts>`) so an intentional retry of a failed
   * recipient is treated as a new message rather than deduplicated.
   */
  idempotencyKey?: string;
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
  /** Tracking pixel fetched by a privacy proxy (e.g. Apple Mail Privacy
   * Protection) — NOT a confirmed human open. Tracked separately from `opened`. */
  | "proxy_opened"
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
