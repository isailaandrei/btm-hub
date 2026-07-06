/**
 * Map stage of the map-reduce global scan.
 *
 * Single-pass synthesis over the whole ~340k-token corpus has an attention
 * ceiling: short `Call note` / `Message log` lines get ignored when composing
 * shortlists. The map stage fixes recall by extracting candidates from many
 * small card batches in parallel — each batch is small enough that nothing
 * drowns — then the existing synthesis (reduce) judges only those candidates.
 */
import { adminAiDebugLog, startAdminAiDebugTimer } from "./debug";
import { mapExtractionSchema, type MapExtraction } from "./schemas";
import type { RenderedContactCard } from "./contact-card";
import type { AdminAiProvider } from "./provider";

export const MAP_CHUNK_SIZE = 30;

const USAGE_KEYS = [
  "prompt_cache_hit_tokens",
  "prompt_cache_miss_tokens",
  "completion_tokens",
] as const;

type MapScanUsage = Record<(typeof USAGE_KEYS)[number], number>;

export type MapScanResult = {
  candidateIds: Set<string>;
  // Corpus-ordered, deduped near-miss ids (disjoint from candidateIds). Consulted
  // by the reduce ONLY when the full-match union is empty (see orchestrator).
  nearMissIds: Set<string>;
  scanMetadata: {
    mode: "map_reduce";
    chunkCount: number;
    chunkSize: number;
    candidateCount: number;
    nearMissCount: number;
    retriedChunkCount: number;
    usage: MapScanUsage;
  };
};

/**
 * Stable index-order slices, tail chunk short. Cards arrive oldest-first from
 * the loader, so earlier chunks keep byte-identical request prefixes across
 * questions (per-chunk DeepSeek prefix cache) and a mid-corpus card edit
 * invalidates only its own chunk.
 */
export function chunkCards<T>(items: T[], size: number): T[][] {
  if (size < 1) throw new Error(`chunkCards size must be >= 1 (got ${size})`);
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export function buildMapExtractionSystemPrompt(): string {
  return [
    "You extract candidates from a small batch of verbatim CRM contact cards.",
    "Consider ONLY the cards in this batch. Do not invent contacts or use outside knowledge.",
    "Flag a contact ONLY if the card contains a SPECIFIC, QUOTABLE statement relevant to the question — a concrete fact, a named project, a defined concept or idea, a stated skill, or an explicit status. Do NOT flag general enthusiasm, broad aspirations, or thematic interest with no concrete substance.",
    "Err on the side of inclusion only WHEN a specific quotable statement exists but its relevance is uncertain — include it and let a later stage judge. Missing a contact who has such a statement is the failure mode; flagging vague interest is noise.",
    "When you are unsure whether a specific statement satisfies the question, include the candidate — relevance uncertainty is resolved by the next stage, and rare or niche criteria especially warrant inclusion on partial matches (e.g. a related environment, activity, or experience).",
    "`evidenceSummary` MUST contain the decisive statement quoted verbatim from the card; name its source line label too (for example `Call note` or `Ultimate Vision`).",
    "When — and ONLY when — NO contact in this batch is a full match AND the question states a RARE, highly specific, or multi-part criterion, you MAY record up to 3 `nearMisses`: contacts whose card holds real PARTIAL evidence toward the question.",
    "Each near-miss MUST quote the real partial evidence verbatim in `evidenceSummary` and name the specific aspect of the question it does NOT satisfy in `missingAspect`. Never invent evidence or overstate a partial match.",
    "If ANY contact in this batch is a full match, or the question is broad or common, return `nearMisses` empty.",
    'Return valid JSON matching this contract: {"candidates":[{"contactId":"uuid","contactName":"string","evidenceSummary":"string"}],"nearMisses":[{"contactId":"uuid","contactName":"string","evidenceSummary":"string","missingAspect":"string"}]}.',
    'Return {"candidates":[],"nearMisses":[]} when no contact in this batch has a specific quotable statement relevant to the question.',
  ].join(" ");
}

export function buildMapExtractionUserPrompt(input: {
  cards: RenderedContactCard[];
  question: string;
}): string {
  // Cards FIRST, question LAST: the card block is the cacheable per-chunk prefix
  // and the per-question text stays at the tail (same trick and card projection
  // as `buildAdminAiUserPrompt` in prompt.ts).
  return JSON.stringify(
    {
      rawContactCards: input.cards.map((card) => ({
        contactId: card.contactId,
        contactName: card.contactName,
        card: card.text,
      })),
      question: input.question,
    },
    null,
    2,
  );
}

type ChunkResult = {
  candidates: MapExtraction["candidates"];
  nearMisses: MapExtraction["nearMisses"];
  usage: Record<string, unknown> | null;
};

export async function runMapScan(input: {
  provider: AdminAiProvider;
  cards: RenderedContactCard[];
  question: string;
}): Promise<MapScanResult> {
  const { provider, cards, question } = input;
  if (!provider.completeJson) {
    throw new Error("map_reduce scan requires a provider with completeJson support");
  }
  const completeJson = provider.completeJson.bind(provider);

  const chunks = chunkCards(cards, MAP_CHUNK_SIZE);
  const validContactIds = new Set(cards.map((card) => card.contactId));
  const systemPrompt = buildMapExtractionSystemPrompt();
  const timer = startAdminAiDebugTimer("map-scan", {
    chunkCount: chunks.length,
    chunkSize: MAP_CHUNK_SIZE,
    cardCount: cards.length,
  });

  const results: Array<ChunkResult | undefined> = new Array(chunks.length);

  async function runChunk(chunkIndex: number): Promise<void> {
    const userPrompt = buildMapExtractionUserPrompt({
      cards: chunks[chunkIndex]!,
      question,
    });
    const { json, modelMetadata } = await completeJson({
      systemPrompt,
      userPrompt,
      scope: "global",
    });
    // Zod-validate the extraction here (fail loud on a malformed chunk).
    const parsed = mapExtractionSchema.parse(json);
    results[chunkIndex] = {
      candidates: parsed.candidates,
      nearMisses: parsed.nearMisses,
      usage: (modelMetadata.usage as Record<string, unknown> | null) ?? null,
    };
  }

  async function attempt(indices: number[]): Promise<number[]> {
    const settled = await Promise.allSettled(indices.map((i) => runChunk(i)));
    const failed: number[] = [];
    settled.forEach((outcome, k) => {
      if (outcome.status === "rejected") failed.push(indices[k]!);
    });
    return failed;
  }

  // Wave 1: all chunks. Wave 2 (automatic retry): re-run only the chunks that
  // failed, once. Any chunk still failing aborts the whole scan — a silently
  // incomplete scan is the exact bug this feature fixes.
  let failed = await attempt(chunks.map((_, i) => i));
  const retriedChunkCount = failed.length;
  if (failed.length > 0) {
    failed = await attempt(failed);
  }
  if (failed.length > 0) {
    timer.end({ status: "failed", failedChunks: failed });
    throw new Error(
      `Map scan failed for chunk(s) ${failed.join(", ")} after one retry — aborting rather than synthesizing a partial scan.`,
    );
  }

  const flagged = new Set<string>();
  const flaggedNearMiss = new Set<string>();
  results.forEach((result, chunkIndex) => {
    const candidates = result?.candidates ?? [];
    const nearMisses = result?.nearMisses ?? [];
    adminAiDebugLog("map-chunk", {
      chunkIndex,
      cardCount: chunks[chunkIndex]!.length,
      candidateCount: candidates.length,
      nearMissCount: nearMisses.length,
    });
    for (const candidate of candidates) {
      if (!validContactIds.has(candidate.contactId)) {
        console.warn(
          "[admin-ai][map-scan] dropping hallucinated candidate contactId",
          { chunkIndex, contactId: candidate.contactId },
        );
        adminAiDebugLog("map-hallucinated-candidate", {
          chunkIndex,
          contactId: candidate.contactId,
        });
        continue;
      }
      flagged.add(candidate.contactId);
    }
    // Per-chunk gate: near-misses count ONLY from a chunk that produced zero full
    // matches (prevents candidate re-inflation on chunks that already qualified).
    if (candidates.length > 0) return;
    for (const nearMiss of nearMisses) {
      if (!validContactIds.has(nearMiss.contactId)) {
        console.warn(
          "[admin-ai][map-scan] dropping hallucinated near-miss contactId",
          { chunkIndex, contactId: nearMiss.contactId },
        );
        adminAiDebugLog("map-hallucinated-near-miss", {
          chunkIndex,
          contactId: nearMiss.contactId,
        });
        continue;
      }
      flaggedNearMiss.add(nearMiss.contactId);
    }
  });

  // Dedupe by contactId while preserving corpus (oldest-first) order. Near-miss
  // ids are kept disjoint from full-match candidates.
  const candidateIds = new Set<string>();
  for (const card of cards) {
    if (flagged.has(card.contactId)) candidateIds.add(card.contactId);
  }
  const nearMissIds = new Set<string>();
  for (const card of cards) {
    if (flaggedNearMiss.has(card.contactId) && !candidateIds.has(card.contactId)) {
      nearMissIds.add(card.contactId);
    }
  }

  const usage: MapScanUsage = {
    prompt_cache_hit_tokens: 0,
    prompt_cache_miss_tokens: 0,
    completion_tokens: 0,
  };
  for (const result of results) {
    if (!result?.usage) continue;
    for (const key of USAGE_KEYS) {
      const value = result.usage[key];
      if (typeof value === "number") usage[key] += value;
    }
  }

  timer.end({
    status: "ok",
    candidateCount: candidateIds.size,
    nearMissCount: nearMissIds.size,
    retriedChunkCount,
  });

  return {
    candidateIds,
    nearMissIds,
    scanMetadata: {
      mode: "map_reduce",
      chunkCount: chunks.length,
      chunkSize: MAP_CHUNK_SIZE,
      candidateCount: candidateIds.size,
      nearMissCount: nearMissIds.size,
      retriedChunkCount,
      usage,
    },
  };
}
