/**
 * Per-contact memory rebuild + cohort backfill orchestration.
 *
 * `rebuildContactMemory` is the single source of truth for "make this
 * contact's memory current". It is idempotent and skips work when the
 * dossier is already fresh against the live source fingerprint and
 * current generator version.
 *
 * `backfillContactMemory` iterates the cohort, calling the rebuild flow
 * per contact. It keeps going past per-contact failures and reports them
 * in aggregate so a noisy edge case never blocks the whole run.
 */

import {
  buildCurrentCrmChunksForContact,
} from "./chunk-builder";
import { buildStableChunkId } from "./chunk-identity";
import { selectChunksForDossier } from "./dossier-chunk-selection";
import { buildFactObservationsFromChunks } from "./fact-observations";
import { compileContactProfileFacts } from "./profile-compiler";
import { buildEvidenceSubchunks } from "./subchunk-builder";
import { generateSubchunkEmbeddings } from "./embeddings";
import { generateContactDossier } from "./dossier-generator";
import { DOSSIER_GENERATOR_VERSION } from "./dossier-prompt";
import { DOSSIER_SCHEMA_VERSION } from "./dossier-version";
import {
  computeChunkSourceFingerprint,
  isDossierStale,
} from "./freshness";
import {
  getContactDossier,
  listContactIdsForMemory,
  listFactObservationsForContact,
  loadContactCrmSources,
  supersedeStaleCurrentCrmEvidenceChunksForContact,
  upsertContactDossier,
  upsertEmbeddings,
  upsertEvidenceChunks,
  upsertEvidenceSubchunks,
  upsertFactObservations,
} from "@/lib/data/admin-ai-memory";
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
    };
  }

  const chunks = buildCurrentCrmChunksForContact({
    contact: sources.contact,
    applications: sources.applications,
    contactNotes: sources.contactNotes,
    contactTags: sources.contactTags,
  });

  await supersedeStaleCurrentCrmEvidenceChunksForContact({
    contactId: input.contactId,
    chunks,
  });

  if (chunks.length === 0) {
    return {
      contactId: input.contactId,
      status: "no_chunks",
      chunkCount: 0,
      dossierUpserted: false,
    };
  }

  await upsertEvidenceChunks({ chunks });
  const subchunks = buildEvidenceSubchunks({ chunks });
  await upsertEvidenceSubchunks({ subchunks });
  try {
    const embeddingBatch = await generateSubchunkEmbeddings({
      parentChunks: chunks,
      subchunks,
    });
    if (embeddingBatch.rows.length > 0) {
      await upsertEmbeddings({ embeddings: embeddingBatch.rows });
    }
  } catch (error) {
    console.warn(
      "[admin-ai-memory] subchunk embedding generation failed",
      {
        contactId: input.contactId,
        error: error instanceof Error ? error.message : String(error),
      },
    );
  }
  const directObservations = buildFactObservationsFromChunks({ chunks });
  if (directObservations.length > 0) {
    await upsertFactObservations({ observations: directObservations });
  }

  if (!input.force) {
    const existingDossier = await getContactDossier({ contactId: input.contactId });
    if (
      !isDossierStale({
        dossier: existingDossier,
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

  const observations = await listFactObservationsForContact({
    contactId: input.contactId,
  });
  const dossierFacts = compileContactProfileFacts({
    contact: sources.contact,
    applications: sources.applications,
    currentChunks: chunks,
    observations,
  });

  // Full chunks stay in the DB for answer-time retrieval. The dossier
  // prompt only sees the narrowed subset — bounded on count and total
  // chars so oversized contacts don't blow past the dossier timeout.
  const dossierChunkSelection = selectChunksForDossier(chunks);
  const chunkPromptItems = dossierChunkSelection.selected.map((c) => ({
    chunkId: buildStableChunkId(c.sourceType, c.sourceId),
    sourceType: c.sourceType,
    sourceLabel: String(c.metadata.sourceLabel ?? c.sourceType),
    sourceTimestamp: c.sourceTimestamp,
    text: c.text,
  }));

  if (dossierChunkSelection.stats.truncated) {
    console.warn(
      "[admin-ai-memory] dossier chunk truncation",
      {
        contactId: input.contactId,
        ...dossierChunkSelection.stats,
      },
    );
  }

  const generation = await generateContactDossier({
    contactId: input.contactId,
    contactFacts: dossierFacts,
    chunks: chunkPromptItems,
  });

  const dossierInput: CrmAiContactDossierInput = {
    contactId: input.contactId,
    dossierVersion: DOSSIER_SCHEMA_VERSION,
    generatorVersion: generation.generatorVersion,
    generatorModel: generation.modelMetadata.model,
    sourceFingerprint: fingerprint,
    sourceCoverage,
    facts: dossierFacts,
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

  return {
    contactId: input.contactId,
    status: "rebuilt",
    chunkCount: chunks.length,
    dossierUpserted: true,
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
