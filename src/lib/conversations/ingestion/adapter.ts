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
  parse(event: unknown): NormalizedConversationMessage;
}
