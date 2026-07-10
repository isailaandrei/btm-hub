export type ConversationSource = "whatsapp";
export type ConversationProvider = "ycloud";
export type ConversationDirection = "inbound" | "outbound";

export type NormalizedConversationMessage = {
  source: ConversationSource;
  provider: ConversationProvider;
  providerMessageId: string;
  direction: ConversationDirection;
  fromIdentifier: string;
  toIdentifier: string;
  body: string;
  media: Array<{
    url: string;
    contentType: string | null;
  }>;
  happenedAt: string;
  rawPayload: Record<string, unknown>;
};

export interface ConversationIngestAdapter {
  /** Returns null when the event is deliberately skipped (e.g. contentless
   * `errors`-type entries); callers must disclose the skip, not drop it
   * silently. */
  parse(event: unknown): NormalizedConversationMessage | null;
}
