/**
 * Freshness helpers for the admin AI memory layer.
 *
 * Three staleness signals matter at the application layer:
 *   1. Source fingerprint mismatch — chunks have changed since the dossier
 *      was built. Recomputed deterministically from the chunk inputs so
 *      "rebuild needed" is a pure function of inputs.
 *   2. Generator version drift — prompt generation has moved forward and
 *      old dossiers no longer match the current contract.
 *   3. Dossier schema drift — persisted dossier/ranking-card semantics have
 *      changed even if the prompt and raw chunks have not.
 *
 * The DB-level `find_stale_admin_ai_contact_memory` RPC handles the
 * "missing dossier" and "explicitly marked stale" cases. These helpers
 * cover the dynamic checks that need live source data.
 */

import { createHash } from "crypto";
import type {
  CrmAiContactDossier,
  CrmAiContactDossierState,
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
  dossierVersion: number;
}): boolean {
  if (!input.dossier) return true;
  if (input.dossier.dossier_version !== input.dossierVersion) return true;
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
  dossierVersion: number;
}): boolean {
  if (
    isDossierStale({
      dossier: input.dossier,
      chunks: input.chunks,
      generatorVersion: input.generatorVersion,
      dossierVersion: input.dossierVersion,
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

export function shouldForceDossierRefreshOnRead(input: {
  dossier: Pick<
    CrmAiContactDossier,
    "dossier_version" | "generator_version"
  > | null;
  generatorVersion: string;
  dossierVersion: number;
}): boolean {
  if (!input.dossier) return true;
  if (input.dossier.dossier_version !== input.dossierVersion) return true;
  if (input.dossier.generator_version !== input.generatorVersion) return true;
  return false;
}

export function isDossierSoftStale(input: {
  dossier: Pick<CrmAiContactDossier, "stale_at"> | null;
  now?: Date;
}): boolean {
  if (!input.dossier?.stale_at) return false;
  const now = input.now ?? new Date();
  return new Date(input.dossier.stale_at).getTime() <= now.getTime();
}

export function findContactsNeedingMemoryRefresh(input: {
  contactIds: string[];
  dossiers: CrmAiContactDossierState[];
  rankingCards: CrmAiContactRankingCard[];
  generatorVersion: string;
  dossierVersion: number;
  now?: Date;
}): string[] {
  const dossierByContact = new Map(
    input.dossiers.map((dossier) => [dossier.contact_id, dossier] as const),
  );
  const rankingCardByContact = new Map(
    input.rankingCards.map((card) => [card.contact_id, card] as const),
  );

  const staleContactIds: string[] = [];
  for (const contactId of input.contactIds) {
    const dossier = dossierByContact.get(contactId) ?? null;
    const rankingCard = rankingCardByContact.get(contactId) ?? null;

    if (
      shouldForceDossierRefreshOnRead({
        dossier,
        generatorVersion: input.generatorVersion,
        dossierVersion: input.dossierVersion,
      })
    ) {
      staleContactIds.push(contactId);
      continue;
    }

    if (isDossierSoftStale({ dossier, now: input.now })) {
      staleContactIds.push(contactId);
      continue;
    }

    // `shouldForceDossierRefreshOnRead` already bails on null dossiers
    // above, so `dossier` is non-null here. The type-narrow assertion
    // keeps TypeScript happy without a redundant runtime branch.
    if (!dossier) continue;

    if (
      !rankingCard ||
      rankingCard.dossier_version !== dossier.dossier_version ||
      rankingCard.source_fingerprint !== dossier.source_fingerprint
    ) {
      staleContactIds.push(contactId);
    }
  }

  return staleContactIds;
}
