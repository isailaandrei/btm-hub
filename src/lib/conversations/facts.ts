import type { ConversationFactInput } from "@/lib/data/conversations";

export const FACT_EXTRACTOR_VERSION = "conversation-facts-v1";

export type ExtractedConversationFact = {
  fieldKey: string | null;
  valueText: string;
  valueJson?: unknown;
  confidence: string;
  conflictGroup?: string | null;
};

export function buildConversationFactInputs(input: {
  contactId: string;
  sourceMessageIds: string[];
  observedAt: string;
  extractorModel: string;
  extractorVersion?: string;
  facts: ExtractedConversationFact[];
}): ConversationFactInput[] {
  return input.facts
    .filter((fact) => fact.valueText.trim().length > 0)
    .map((fact) => ({
      contactId: input.contactId,
      source: "whatsapp",
      fieldKey: fact.fieldKey,
      valueText: fact.valueText,
      valueJson: fact.valueJson ?? null,
      confidence: fact.confidence,
      sourceMessageIds: input.sourceMessageIds,
      observedAt: input.observedAt,
      conflictGroup:
        fact.conflictGroup ?? fact.fieldKey ?? `conversation:${input.contactId}`,
      extractorModel: input.extractorModel,
      extractorVersion: input.extractorVersion ?? FACT_EXTRACTOR_VERSION,
    }));
}
