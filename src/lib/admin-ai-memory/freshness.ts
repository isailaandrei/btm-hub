/**
 * Freshness helpers for the admin AI memory layer.
 *
 * Two staleness signals matter at the application layer:
 *   1. Source fingerprint mismatch — chunks have changed since the dossier
 *      was built. Recomputed deterministically from the chunk inputs so
 *      "rebuild needed" is a pure function of inputs.
 *   2. Generator version drift — prompt or schema has moved forward and
 *      old dossiers no longer match the current contract.
 *
 * The DB-level `find_stale_admin_ai_contact_memory` RPC handles the
 * "missing dossier" and "explicitly marked stale" cases. These helpers
 * cover the dynamic checks that need live source data.
 */

import { createHash } from "crypto";
import type {
  CrmAiContactDossier,
  CrmAiContactRankingCard,
  CrmAiEvidenceChunkInput,
} from "@/types/admin-ai-memory";

export function computeChunkSourceFingerprint(
  chunks: CrmAiEvidenceChunkInput[],
): string {
  const tuples = chunks
    .map((c) => `${c.sourceType}:${c.sourceId}:${c.contentHash}`)
    .sort();
  const hash = createHash("sha256");
  hash.update(String(chunks.length));
  hash.update("\u0001");
  for (const tuple of tuples) {
    hash.update(tuple);
    hash.update("\u0001");
  }
  return hash.digest("hex");
}

export function isDossierStale(input: {
  dossier: CrmAiContactDossier | null;
  chunks: CrmAiEvidenceChunkInput[];
  generatorVersion: string;
}): boolean {
  if (!input.dossier) return true;
  if (input.dossier.generator_version !== input.generatorVersion) return true;
  const expected = computeChunkSourceFingerprint(input.chunks);
  if (input.dossier.source_fingerprint !== expected) return true;
  return false;
}

export function isRankingCardStale(input: {
  rankingCard: CrmAiContactRankingCard | null;
  dossier: CrmAiContactDossier | null;
}): boolean {
  if (!input.rankingCard) return true;
  if (!input.dossier) return true;
  if (input.rankingCard.dossier_version !== input.dossier.dossier_version) {
    return true;
  }
  if (
    input.rankingCard.source_fingerprint !== input.dossier.source_fingerprint
  ) {
    return true;
  }
  return false;
}

export function needsContactMemoryRebuild(input: {
  dossier: CrmAiContactDossier | null;
  rankingCard: CrmAiContactRankingCard | null;
  chunks: CrmAiEvidenceChunkInput[];
  generatorVersion: string;
}): boolean {
  if (
    isDossierStale({
      dossier: input.dossier,
      chunks: input.chunks,
      generatorVersion: input.generatorVersion,
    })
  ) {
    return true;
  }
  if (
    isRankingCardStale({
      rankingCard: input.rankingCard,
      dossier: input.dossier,
    })
  ) {
    return true;
  }
  return false;
}
