/**
 * Deterministic refresh of the structural slice of the memory layer.
 *
 * Runs on every admin write that touches tags, notes, or structural
 * contact fields. No dossier-generation call — we only touch the parts of
 * the dossier that are pure projections of the source data:
 *
 *   - Evidence chunks (delete stale + upsert current).
 *   - Dossier `facts_json` (via the deterministic profile compiler) + `stale_at`
 *     stamp so the next AI-involving read knows the interpretive fields
 *     may lag.
 *
 * Signals, evidence anchors, contradictions, unknowns, and summaries
 * are NOT touched here — those still come from the dossier generator
 * and only refresh on backfill or version drift.
 *
 * This path may still refresh subchunk embeddings when evidence changes.
 * For zero-OpenAI contract migrations, use `upgradeContactDossierFactsShape`,
 * which reshapes persisted dossier facts from stored memory only.
 *
 * Must stay fast. Admins call this from server actions inline with
 * their tag/note writes. Three cheap Supabase reads + one write,
 * typically ~100ms end-to-end.
 */

import { buildCurrentCrmChunksForContact } from "./chunk-builder";
import { DOSSIER_SCHEMA_VERSION } from "./dossier-version";
import { buildFactObservationsFromChunks } from "./fact-observations";
import { computeChunkSourceFingerprint } from "./freshness";
import { compileContactProfileFacts } from "./profile-compiler";
import { buildEvidenceSubchunks } from "./subchunk-builder";
import { generateSubchunkEmbeddings } from "./embeddings";
import {
  getContactDossier,
  listCurrentCrmEvidenceChunkInputsForContact,
  listFactObservationsForContact,
  loadContactCrmSources,
  patchContactDossierStructural,
  supersedeStaleCurrentCrmEvidenceChunksForContact,
  upsertEmbeddings,
  upsertFactObservations,
  upsertEvidenceChunks,
  upsertEvidenceSubchunks,
} from "@/lib/data/admin-ai-memory";

export type FactsRefreshStatus =
  | "refreshed"
  | "no_dossier"
  | "missing_sources";

export type FactsRefreshResult = {
  contactId: string;
  status: FactsRefreshStatus;
  chunkCount: number;
  dossierPatched: boolean;
};

export type FactsShapeUpgradeStatus =
  | "upgraded"
  | "no_dossier"
  | "missing_sources";

export type FactsShapeUpgradeResult = {
  contactId: string;
  status: FactsShapeUpgradeStatus;
  chunkCount: number;
  dossierPatched: boolean;
};

function buildSourceCoverage(input: {
  applications: number;
  contactNotes: number;
  applicationAdminNotes: number;
}) {
  return {
    applicationCount: input.applications,
    contactNoteCount: input.contactNotes,
    applicationAdminNoteCount: input.applicationAdminNotes,
    whatsappMessageCount: 0,
    instagramMessageCount: 0,
    zoomChunkCount: 0,
  };
}

export async function refreshContactMemoryFacts(input: {
  contactId: string;
}): Promise<FactsRefreshResult> {
  const sources = await loadContactCrmSources({ contactId: input.contactId });
  if (!sources) {
    return {
      contactId: input.contactId,
      status: "missing_sources",
      chunkCount: 0,
      dossierPatched: false,
    };
  }

  // 1. Sync chunks. Text-field changes produce new content_hash values
  //    → in-place update. Deleted rows get their chunks pruned.
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
  if (chunks.length > 0) {
    await upsertEvidenceChunks({ chunks });
    const subchunks = buildEvidenceSubchunks({ chunks });
    await upsertEvidenceSubchunks({
      subchunks,
    });
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
  }
  const observations = buildFactObservationsFromChunks({ chunks });
  if (observations.length > 0) {
    await upsertFactObservations({ observations });
  }

  // 2. If there's no dossier yet, we've done everything we can without
  //    the AI. The next backfill will build the dossier from the now-
  //    current chunks.
  const dossier = await getContactDossier({ contactId: input.contactId });
  if (!dossier) {
    return {
      contactId: input.contactId,
      status: "no_dossier",
      chunkCount: chunks.length,
      dossierPatched: false,
    };
  }

  // 3. Rebuild the structural facts.
  const historicalObservations = await listFactObservationsForContact({
    contactId: input.contactId,
  });
  const facts = compileContactProfileFacts({
    contact: sources.contact,
    applications: sources.applications,
    currentChunks: chunks,
    observations: historicalObservations,
  });

  // 4. Patch the dossier: fresh facts, stale_at stamped. Interpretive
  //    fields untouched.
  await patchContactDossierStructural({
    contactId: input.contactId,
    facts,
    staleAt: new Date().toISOString(),
  });

  return {
    contactId: input.contactId,
    status: "refreshed",
    chunkCount: chunks.length,
    dossierPatched: true,
  };
}

export async function upgradeContactDossierFactsShape(input: {
  contactId: string;
}): Promise<FactsShapeUpgradeResult> {
  const sources = await loadContactCrmSources({ contactId: input.contactId });
  if (!sources) {
    return {
      contactId: input.contactId,
      status: "missing_sources",
      chunkCount: 0,
      dossierPatched: false,
    };
  }

  const dossier = await getContactDossier({ contactId: input.contactId });
  if (!dossier) {
    return {
      contactId: input.contactId,
      status: "no_dossier",
      chunkCount: 0,
      dossierPatched: false,
    };
  }

  const currentChunks = await listCurrentCrmEvidenceChunkInputsForContact({
    contactId: input.contactId,
  });
  const observations = await listFactObservationsForContact({
    contactId: input.contactId,
  });
  const facts = compileContactProfileFacts({
    contact: sources.contact,
    applications: sources.applications,
    currentChunks,
    observations,
  });
  const sourceCoverage = buildSourceCoverage({
    applications: sources.applications.length,
    contactNotes: sources.contactNotes.length,
    applicationAdminNotes: currentChunks.filter(
      (chunk) => chunk.sourceType === "application_admin_note",
    ).length,
  });

  await patchContactDossierStructural({
    contactId: input.contactId,
    facts,
    staleAt: dossier.stale_at,
    dossierVersion: DOSSIER_SCHEMA_VERSION,
    sourceFingerprint: computeChunkSourceFingerprint(currentChunks),
    sourceCoverage,
  });

  return {
    contactId: input.contactId,
    status: "upgraded",
    chunkCount: currentChunks.length,
    dossierPatched: true,
  };
}
