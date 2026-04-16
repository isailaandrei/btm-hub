/**
 * Per-contact memory rebuild + cohort backfill orchestration.
 *
 * `rebuildContactMemory` is the single source of truth for "make this
 * contact's memory current". It is idempotent and skips work when the
 * dossier and ranking card are already fresh against the live source
 * fingerprint and current generator version.
 *
 * `backfillContactMemory` iterates the cohort, calling the rebuild flow
 * per contact. It keeps going past per-contact failures and reports them
 * in aggregate so a noisy edge case never blocks the whole run.
 */

import {
  buildCurrentCrmChunksForContact,
} from "./chunk-builder";
import { buildStableChunkId } from "./chunk-identity";
import { buildDossierContactFacts } from "./contact-facts";
import { generateContactDossier } from "./dossier-generator";
import { DOSSIER_GENERATOR_VERSION } from "./dossier-prompt";
import { DOSSIER_SCHEMA_VERSION } from "./dossier-version";
import {
  computeChunkSourceFingerprint,
  needsContactMemoryRebuild,
} from "./freshness";
import { buildRankingCardFromDossier } from "./ranking-card";
import {
  getContactDossier,
  listContactIdsForMemory,
  listRankingCards,
  loadContactCrmSources,
  upsertContactDossier,
  upsertEvidenceChunks,
  upsertRankingCard,
} from "@/lib/data/admin-ai-memory";
import { queryAdminAiContactFacts } from "@/lib/data/admin-ai-retrieval";
import type {
  CrmAiContactDossierInput,
  DossierSourceCoverage,
} from "@/types/admin-ai-memory";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type RebuildStatus =
  | "rebuilt"
  | "fresh"
  | "no_chunks"
  | "missing_sources";

export type RebuildContactMemoryResult = {
  contactId: string;
  status: RebuildStatus;
  chunkCount: number;
  dossierUpserted: boolean;
  rankingCardUpserted: boolean;
};

export type BackfillStats = {
  contactsProcessed: number;
  contactsSucceeded: number;
  contactsFailed: number;
  contactsRebuilt: number;
  contactsAlreadyFresh: number;
  skippedNoChunks: number;
  skippedMissingSources: number;
  chunksUpserted: number;
  dossiersUpserted: number;
  rankingCardsUpserted: number;
  failures: Array<{ contactId: string; error: string }>;
};

// ---------------------------------------------------------------------------
// Per-contact rebuild
// ---------------------------------------------------------------------------

function buildSourceCoverage(input: {
  applications: number;
  contactNotes: number;
  applicationAdminNotes: number;
}): DossierSourceCoverage {
  return {
    applicationCount: input.applications,
    contactNoteCount: input.contactNotes,
    applicationAdminNoteCount: input.applicationAdminNotes,
    whatsappMessageCount: 0,
    instagramMessageCount: 0,
    zoomChunkCount: 0,
  };
}

export async function rebuildContactMemory(input: {
  contactId: string;
  force?: boolean;
}): Promise<RebuildContactMemoryResult> {
  const sources = await loadContactCrmSources({ contactId: input.contactId });
  if (!sources) {
    return {
      contactId: input.contactId,
      status: "missing_sources",
      chunkCount: 0,
      dossierUpserted: false,
      rankingCardUpserted: false,
    };
  }

  const chunks = buildCurrentCrmChunksForContact({
    contact: sources.contact,
    applications: sources.applications,
    contactNotes: sources.contactNotes,
  });

  if (chunks.length === 0) {
    return {
      contactId: input.contactId,
      status: "no_chunks",
      chunkCount: 0,
      dossierUpserted: false,
      rankingCardUpserted: false,
    };
  }

  await upsertEvidenceChunks({ chunks });

  if (!input.force) {
    const [existingDossier, [existingRankingCard]] = await Promise.all([
      getContactDossier({ contactId: input.contactId }),
      listRankingCards({ contactIds: [input.contactId], limit: 1 }),
    ]);
    if (
      !needsContactMemoryRebuild({
        dossier: existingDossier,
        rankingCard: existingRankingCard ?? null,
        chunks,
        generatorVersion: DOSSIER_GENERATOR_VERSION,
        dossierVersion: DOSSIER_SCHEMA_VERSION,
      })
    ) {
      return {
        contactId: input.contactId,
        status: "fresh",
        chunkCount: chunks.length,
        dossierUpserted: false,
        rankingCardUpserted: false,
      };
    }
  }

  const fingerprint = computeChunkSourceFingerprint(chunks);
  const sourceCoverage = buildSourceCoverage({
    applications: sources.applications.length,
    contactNotes: sources.contactNotes.length,
    applicationAdminNotes: chunks.filter(
      (c) => c.sourceType === "application_admin_note",
    ).length,
  });

  const factRows = await queryAdminAiContactFacts({
    filters: [],
    contactId: input.contactId,
    limit: 100,
  });
  const dossierFacts = buildDossierContactFacts({
    contact: sources.contact,
    factRows,
    applicationCount: sources.applications.length,
  });

  // Map chunks to deterministic stable ids so the dossier model can anchor
  // evidence by the same `chunkId` that answer-time citations persist.
  const chunkPromptItems = chunks.map((c) => ({
    chunkId: buildStableChunkId(c.sourceType, c.sourceId),
    sourceType: c.sourceType,
    sourceLabel: String(c.metadata.sourceLabel ?? c.sourceType),
    sourceTimestamp: c.sourceTimestamp,
    text: c.text,
  }));

  const generation = await generateContactDossier({
    contactId: input.contactId,
    contactFacts: dossierFacts,
    chunks: chunkPromptItems,
  });

  const dossierInput: CrmAiContactDossierInput = {
    contactId: input.contactId,
    dossierVersion: DOSSIER_SCHEMA_VERSION,
    generatorVersion: generation.generatorVersion,
    sourceFingerprint: fingerprint,
    sourceCoverage,
    facts: generation.dossier.facts,
    signals: generation.dossier.signals,
    contradictions: generation.dossier.contradictions,
    unknowns: generation.dossier.unknowns,
    evidenceAnchors: generation.dossier.evidenceAnchors,
    shortSummary: generation.dossier.summary.short,
    mediumSummary: generation.dossier.summary.medium,
    confidence: generation.dossier.confidence ?? {},
    staleAt: null,
  };

  await upsertContactDossier(dossierInput);

  const dossierForCard = {
    contact_id: dossierInput.contactId,
    dossier_version: dossierInput.dossierVersion,
    generator_version: dossierInput.generatorVersion,
    source_fingerprint: dossierInput.sourceFingerprint,
    source_coverage: dossierInput.sourceCoverage,
    facts_json: dossierInput.facts,
    signals_json: dossierInput.signals,
    contradictions_json: dossierInput.contradictions,
    unknowns_json: dossierInput.unknowns,
    evidence_anchors_json: dossierInput.evidenceAnchors,
    short_summary: dossierInput.shortSummary,
    medium_summary: dossierInput.mediumSummary,
    confidence_json: dossierInput.confidence,
    last_built_at: new Date().toISOString(),
    stale_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await upsertRankingCard(buildRankingCardFromDossier(dossierForCard));

  return {
    contactId: input.contactId,
    status: "rebuilt",
    chunkCount: chunks.length,
    dossierUpserted: true,
    rankingCardUpserted: true,
  };
}

// ---------------------------------------------------------------------------
// Cohort backfill
// ---------------------------------------------------------------------------

export async function backfillContactMemory(input: {
  limit?: number;
  contactIds?: string[];
  force?: boolean;
}): Promise<BackfillStats> {
  const stats: BackfillStats = {
    contactsProcessed: 0,
    contactsSucceeded: 0,
    contactsFailed: 0,
    contactsRebuilt: 0,
    contactsAlreadyFresh: 0,
    skippedNoChunks: 0,
    skippedMissingSources: 0,
    chunksUpserted: 0,
    dossiersUpserted: 0,
    rankingCardsUpserted: 0,
    failures: [],
  };

  const ids = input.contactIds && input.contactIds.length > 0
    ? input.contactIds
    : await listContactIdsForMemory({ limit: input.limit });

  for (const contactId of ids) {
    stats.contactsProcessed += 1;
    try {
      const result = await rebuildContactMemory({
        contactId,
        force: input.force,
      });
      stats.contactsSucceeded += 1;
      stats.chunksUpserted += result.chunkCount;
      if (result.dossierUpserted) stats.dossiersUpserted += 1;
      if (result.rankingCardUpserted) stats.rankingCardsUpserted += 1;
      switch (result.status) {
        case "rebuilt":
          stats.contactsRebuilt += 1;
          break;
        case "fresh":
          stats.contactsAlreadyFresh += 1;
          break;
        case "no_chunks":
          stats.skippedNoChunks += 1;
          break;
        case "missing_sources":
          stats.skippedMissingSources += 1;
          break;
      }
    } catch (error) {
      stats.contactsFailed += 1;
      const message = error instanceof Error ? error.message : String(error);
      stats.failures.push({ contactId, error: message });
    }
  }

  return stats;
}
