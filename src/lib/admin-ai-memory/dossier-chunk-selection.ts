/**
 * Deterministic chunk selection for dossier generation.
 *
 * Full contact evidence can easily run past gpt-4o-mini's cost-effective
 * input range (30-50KB of chunk text for heavy contacts). The dossier
 * prompt doesn't need every chunk — it needs a bounded, representative
 * set the model can actually reason over within the 60s timeout.
 *
 * Rules:
 *   - Full chunk set still gets upserted to `crm_ai_evidence_chunks`
 *     (answer-time retrieval operates over the full set).
 *   - Only the dossier prompt operates on the selected subset.
 *   - Priority is deterministic and reversible (same input → same output).
 *   - Hard caps on chunk count AND total text size, whichever hits first.
 *
 * Priority (highest first):
 *   1. Contact notes — most recent first (admin-maintained narrative).
 *   2. Application admin notes — most recent first (admin's own read).
 *   3. Application answers — in `ADMIN_AI_TEXT_FIELDS` order.
 *   4. Any future source types in insertion order.
 */

import { ADMIN_AI_TEXT_FIELDS } from "@/lib/admin-ai/field-config";
import { CHUNK_SOURCE_TYPES } from "./source-types";
import type {
  CrmAiChunkSourceType,
  CrmAiEvidenceChunkInput,
} from "@/types/admin-ai-memory";

export const MAX_DOSSIER_CHUNKS = 40;
export const MAX_DOSSIER_CHARS = 20_000;

export type ChunkSelectionStats = {
  originalCount: number;
  originalChars: number;
  selectedCount: number;
  selectedChars: number;
  droppedByChunkCap: number;
  droppedByCharCap: number;
  truncated: boolean;
};

export type ChunkSelectionResult = {
  selected: CrmAiEvidenceChunkInput[];
  stats: ChunkSelectionStats;
};

const SOURCE_TYPE_PRIORITY: Record<CrmAiChunkSourceType, number> = {
  [CHUNK_SOURCE_TYPES.contactNote]: 0,
  [CHUNK_SOURCE_TYPES.applicationAdminNote]: 1,
  [CHUNK_SOURCE_TYPES.applicationAnswer]: 2,
  [CHUNK_SOURCE_TYPES.whatsappMessage]: 3,
  [CHUNK_SOURCE_TYPES.instagramMessage]: 3,
  [CHUNK_SOURCE_TYPES.zoomTranscriptChunk]: 3,
};

const TEXT_FIELD_ORDER = new Map<string, number>(
  ADMIN_AI_TEXT_FIELDS.map((field, index) => [field, index] as const),
);

function timestampRank(value: string | null): number {
  // Descending by time: more recent = smaller rank. Nulls last.
  if (!value) return Number.MAX_SAFE_INTEGER;
  const t = Date.parse(value);
  if (Number.isNaN(t)) return Number.MAX_SAFE_INTEGER;
  // Negate so larger timestamps (more recent) sort first.
  return -t;
}

function textFieldRank(chunk: CrmAiEvidenceChunkInput): number {
  if (chunk.sourceType !== CHUNK_SOURCE_TYPES.applicationAnswer) {
    return Number.MAX_SAFE_INTEGER;
  }
  const label = chunk.metadata.sourceLabel;
  if (typeof label !== "string") return Number.MAX_SAFE_INTEGER;
  return TEXT_FIELD_ORDER.get(label) ?? Number.MAX_SAFE_INTEGER;
}

function compareChunks(
  a: CrmAiEvidenceChunkInput,
  b: CrmAiEvidenceChunkInput,
): number {
  const typeDiff =
    (SOURCE_TYPE_PRIORITY[a.sourceType] ?? Number.MAX_SAFE_INTEGER) -
    (SOURCE_TYPE_PRIORITY[b.sourceType] ?? Number.MAX_SAFE_INTEGER);
  if (typeDiff !== 0) return typeDiff;

  if (
    a.sourceType === CHUNK_SOURCE_TYPES.contactNote ||
    a.sourceType === CHUNK_SOURCE_TYPES.applicationAdminNote
  ) {
    const tsDiff = timestampRank(a.sourceTimestamp) - timestampRank(b.sourceTimestamp);
    if (tsDiff !== 0) return tsDiff;
  }

  if (a.sourceType === CHUNK_SOURCE_TYPES.applicationAnswer) {
    const fieldDiff = textFieldRank(a) - textFieldRank(b);
    if (fieldDiff !== 0) return fieldDiff;
  }

  // Final tie-breaker: sourceId alphabetically. Keeps output stable.
  return a.sourceId.localeCompare(b.sourceId);
}

export function selectChunksForDossier(
  chunks: CrmAiEvidenceChunkInput[],
  options: {
    maxChunks?: number;
    maxChars?: number;
  } = {},
): ChunkSelectionResult {
  const maxChunks = options.maxChunks ?? MAX_DOSSIER_CHUNKS;
  const maxChars = options.maxChars ?? MAX_DOSSIER_CHARS;

  // Dedup by (sourceType, sourceId). Upstream chunk builder already
  // guarantees this, but a defensive pass here costs nothing.
  const seen = new Set<string>();
  const deduped: CrmAiEvidenceChunkInput[] = [];
  for (const chunk of chunks) {
    const key = `${chunk.sourceType}:${chunk.sourceId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(chunk);
  }

  const originalCount = deduped.length;
  const originalChars = deduped.reduce((sum, c) => sum + c.text.length, 0);

  const sorted = [...deduped].sort(compareChunks);

  const selected: CrmAiEvidenceChunkInput[] = [];
  let runningChars = 0;
  let droppedByChunkCap = 0;
  let droppedByCharCap = 0;

  for (const chunk of sorted) {
    if (selected.length >= maxChunks) {
      droppedByChunkCap += 1;
      continue;
    }
    if (runningChars + chunk.text.length > maxChars) {
      droppedByCharCap += 1;
      continue;
    }
    selected.push(chunk);
    runningChars += chunk.text.length;
  }

  const stats: ChunkSelectionStats = {
    originalCount,
    originalChars,
    selectedCount: selected.length,
    selectedChars: runningChars,
    droppedByChunkCap,
    droppedByCharCap,
    truncated: droppedByChunkCap + droppedByCharCap > 0,
  };

  return { selected, stats };
}
