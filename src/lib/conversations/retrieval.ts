import { generateQueryEmbedding } from "./embeddings";
import {
  searchConversationEmbeddings,
  searchConversationMessagesFts,
  type ConversationEvidenceHit,
} from "@/lib/data/conversations";
import type { EvidenceItem } from "@/types/admin-ai";

function hitToEvidence(hit: ConversationEvidenceHit): EvidenceItem {
  if (!hit.contactId) {
    throw new Error("Cannot cite unmatched conversation messages as contact evidence.");
  }
  return {
    evidenceId: `whatsapp_message:${hit.messageId}`,
    contactId: hit.contactId,
    applicationId: null,
    sourceType: "whatsapp_message",
    sourceId: hit.messageId,
    sourceLabel: "WhatsApp message",
    sourceTimestamp: hit.happenedAt,
    program: null,
    text: hit.body,
  };
}

export async function retrieveConversationEvidence(input: {
  question: string;
  contactId?: string | null;
  limit?: number;
}): Promise<EvidenceItem[]> {
  const limit = input.limit ?? 40;
  const queryEmbedding = await generateQueryEmbedding({ text: input.question });
  const [vectorHits, ftsHits] = await Promise.all([
    searchConversationEmbeddings({
      embedding: queryEmbedding.embedding,
      contactId: input.contactId ?? null,
      limit,
    }),
    searchConversationMessagesFts({
      query: input.question,
      contactId: input.contactId ?? null,
      limit,
    }),
  ]);

  const byMessageId = new Map<string, ConversationEvidenceHit>();
  for (const hit of [...vectorHits, ...ftsHits]) {
    const existing = byMessageId.get(hit.messageId);
    if (!existing || hit.score > existing.score) {
      byMessageId.set(hit.messageId, hit);
    }
  }

  return [...byMessageId.values()]
    .filter((hit) => Boolean(hit.contactId))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(hitToEvidence);
}
