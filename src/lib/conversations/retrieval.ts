import { generateQueryEmbedding } from "./embeddings";
import {
  hasConversationMessages,
  searchConversationEmbeddings,
  searchConversationMessagesFts,
  type ConversationEvidenceHit,
} from "@/lib/data/conversations";
import type { EvidenceItem } from "@/types/admin-ai";

const RECIPROCAL_RANK_FUSION_K = 60;

type RankedConversationHit = ConversationEvidenceHit & {
  fusedScore: number;
  bestRank: number;
};

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

function addRankedHits(
  byMessageId: Map<string, RankedConversationHit>,
  hits: ConversationEvidenceHit[],
): void {
  hits.forEach((hit, index) => {
    const rank = index + 1;
    const rankScore = 1 / (RECIPROCAL_RANK_FUSION_K + rank);
    const existing = byMessageId.get(hit.messageId);
    if (!existing) {
      byMessageId.set(hit.messageId, {
        ...hit,
        fusedScore: rankScore,
        bestRank: rank,
      });
      return;
    }

    existing.fusedScore += rankScore;
    existing.bestRank = Math.min(existing.bestRank, rank);
  });
}

export async function retrieveConversationEvidence(input: {
  question: string;
  contactId?: string | null;
  limit?: number;
}): Promise<EvidenceItem[]> {
  const limit = input.limit ?? 40;
  const contactId = input.contactId ?? null;
  const hasMessages = await hasConversationMessages({ contactId });
  if (!hasMessages) return [];

  const queryEmbedding = await generateQueryEmbedding({ text: input.question });
  const [vectorHits, ftsHits] = await Promise.all([
    searchConversationEmbeddings({
      embedding: queryEmbedding.embedding,
      contactId,
      limit,
    }),
    searchConversationMessagesFts({
      query: input.question,
      contactId,
      limit,
    }),
  ]);

  const byMessageId = new Map<string, RankedConversationHit>();
  addRankedHits(byMessageId, vectorHits);
  addRankedHits(byMessageId, ftsHits);

  return [...byMessageId.values()]
    .filter((hit) => Boolean(hit.contactId))
    .sort((a, b) => {
      if (b.fusedScore !== a.fusedScore) return b.fusedScore - a.fusedScore;
      if (a.bestRank !== b.bestRank) return a.bestRank - b.bestRank;
      return (b.happenedAt ?? "").localeCompare(a.happenedAt ?? "");
    })
    .slice(0, limit)
    .map(hitToEvidence);
}
