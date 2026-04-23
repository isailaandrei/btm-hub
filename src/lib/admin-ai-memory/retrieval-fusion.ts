import {
  listRecentAdminAiEvidence,
  searchAdminAiEvidence,
  searchAdminAiEvidenceByEmbedding,
} from "@/lib/data/admin-ai-retrieval";
import { generateQueryEmbedding } from "./embeddings";
import type { EvidenceItem } from "@/types/admin-ai";

type RankedEvidence = {
  evidence: EvidenceItem;
  score: number;
};

function mergeEvidence(
  vectorHits: RankedEvidence[],
  lexicalHits: EvidenceItem[],
  limit: number,
): EvidenceItem[] {
  const ranked = new Map<string, RankedEvidence>();

  for (const hit of vectorHits) {
    ranked.set(hit.evidence.evidenceId, hit);
  }

  for (const item of lexicalHits) {
    const existing = ranked.get(item.evidenceId);
    if (existing) {
      existing.score += 1;
    } else {
      ranked.set(item.evidenceId, {
        evidence: item,
        score: 0.5,
      });
    }
  }

  return Array.from(ranked.values())
    .sort((a, b) => b.score - a.score || a.evidence.evidenceId.localeCompare(b.evidence.evidenceId))
    .slice(0, limit)
    .map((entry) => entry.evidence);
}

export async function retrieveHybridEvidence(input: {
  question: string;
  textFocus: string[];
  contactIds?: string[];
  contactId?: string;
  limit: number;
}): Promise<EvidenceItem[]> {
  const lexicalPromise = searchAdminAiEvidence({
    textFocus: input.textFocus,
    contactIds: input.contactIds,
    contactId: input.contactId,
    limit: input.limit,
  });

  let vectorHits: RankedEvidence[] = [];
  try {
    const queryEmbedding = await generateQueryEmbedding({
      text: input.question,
    });
    vectorHits = await searchAdminAiEvidenceByEmbedding({
      embedding: queryEmbedding.embedding,
      contactIds: input.contactIds,
      contactId: input.contactId,
      limit: input.limit,
    });
  } catch (error) {
    console.warn(
      "[admin-ai-memory] query embedding retrieval failed — falling back to lexical evidence only",
      { error: error instanceof Error ? error.message : String(error) },
    );
  }

  const lexicalHits = await lexicalPromise;
  const fused = mergeEvidence(vectorHits, lexicalHits, input.limit);
  if (fused.length > 0) {
    return fused;
  }

  return listRecentAdminAiEvidence({
    contactIds: input.contactIds,
    contactId: input.contactId,
    limit: input.limit,
  });
}
