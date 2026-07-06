import { getFieldEntry } from "@/lib/admin/contacts/field-registry";
import type { ConversationFactInput } from "@/lib/data/conversations";

export const FACT_EXTRACTOR_VERSION = "conversation-facts-v1";

export type ExtractedConversationFact = {
  fieldKey: string | null;
  valueText: string;
  valueJson?: unknown;
  confidence: string;
  conflictGroup?: string | null;
};

/**
 * Code-enforces the digest prompt's fieldKey allowlist (built from the same
 * FIELD_REGISTRY): the model sometimes invents non-registry keys (e.g.
 * "accommodation_ties", "questions_or_concerns") instead of null. Map any key
 * not in the registry back to null, keeping valueText/confidence/conflictGroup.
 */
function normalizeFieldKey(fieldKey: string | null): string | null {
  if (fieldKey === null) return null;
  if (getFieldEntry(fieldKey)) return fieldKey;
  console.debug("[conversations] dropped non-registry fieldKey", { fieldKey });
  return null;
}

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
    .map((fact) => {
      const fieldKey = normalizeFieldKey(fact.fieldKey);
      return {
        contactId: input.contactId,
        source: "whatsapp",
        fieldKey,
        valueText: fact.valueText,
        valueJson: fact.valueJson ?? null,
        confidence: fact.confidence,
        sourceMessageIds: input.sourceMessageIds,
        observedAt: input.observedAt,
        conflictGroup:
          fact.conflictGroup ?? fieldKey ?? `conversation:${input.contactId}`,
        extractorModel: input.extractorModel,
        extractorVersion: input.extractorVersion ?? FACT_EXTRACTOR_VERSION,
      };
    });
}
